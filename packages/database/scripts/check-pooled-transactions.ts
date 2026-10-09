import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import { parse } from "pg-connection-string";
import { createDatabase, type Database } from "../src/client";
import { createDatabasePool, describeDatabaseError } from "../src/pool";
import { usesVerifiedTls } from "../src/tls";
import { limitServerWaits, SERVER_LIMITS_MS } from "../src/transaction";

// Usage: POOLED_CHECK_URL=<pooled URL of a Neon branch> npm run db:check-pooled -w @incision/database
//
// Checks, through the real connection path (Neon's PgBouncer in transaction mode), what the
// pool and the transactions rely on. It reads and writes no table: it only takes
// transaction-level advisory locks on random keys, sleeps and reads settings. The URL is
// never printed, and no .env file is read: the variable has to be given explicitly.

type Check = { readonly name: string; readonly run: (url: string) => Promise<string> };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const lockKey = () => randomInt(1, 2 ** 47);

function sqlStateOf(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth += 1) {
    if ("code" in current && typeof current.code === "string" && /^[0-9A-Z]{5}$/.test(current.code)) {
      return current.code;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return undefined;
}

/** Runs `work` on a fresh pool of the application, then closes it. */
async function withDatabase<T>(url: string, work: (db: Database) => Promise<T>, queryTimeoutMs?: number): Promise<T> {
  const pool = createDatabasePool(url, queryTimeoutMs === undefined ? { max: 2 } : { max: 2, queryTimeoutMs });
  try {
    return await work(createDatabase(pool));
  } finally {
    await pool.end();
  }
}

/** Waits for `work` to fail with `expected`, and returns how long it took. */
async function failsWith(expected: string, work: () => Promise<unknown>): Promise<number> {
  const started = performance.now();
  try {
    await work();
  } catch (error: unknown) {
    const state = sqlStateOf(error);
    if (state !== expected) {
      throw new Error(`expected ${expected}, got ${state ?? describeDatabaseError(error)}`, { cause: error });
    }
    return Math.round(performance.now() - started);
  }
  throw new Error(`expected ${expected}, but it succeeded`);
}

/** Another connection holds a transaction-level advisory lock on `key` until `release`. */
async function holdAdvisoryLock(db: Database, key: number): Promise<{ release: () => Promise<void> }> {
  let release: () => void = () => undefined;
  let taken: () => void = () => undefined;
  const isTaken = new Promise<void>((resolve) => {
    taken = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${key})`);
    taken();
    await released;
  });
  await isTaken;
  return {
    release: async () => {
      release();
      await holder;
    },
  };
}

/** How long until a transaction with a short lock wait obtains the advisory lock `key`. */
async function msUntilLockFree(db: Database, key: number, giveUpMs: number): Promise<number> {
  const started = performance.now();
  while (performance.now() - started < giveUpMs) {
    try {
      await db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('lock_timeout', '250ms', true)`);
        await tx.execute(sql`select pg_advisory_xact_lock(${key})`);
      });
      return Math.round(performance.now() - started);
    } catch (error: unknown) {
      if (sqlStateOf(error) !== "55P03") {
        throw error;
      }
    }
  }
  throw new Error(`the lock was still held after ${giveUpMs} ms`);
}

const checks: readonly Check[] = [
  {
    name: "the limits apply to their transaction only",
    run: (url) =>
      withDatabase(url, async (db) => {
        const read = sql`select current_setting('lock_timeout') as lock, current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle`;
        const inside = await db.transaction(async (tx) => {
          await limitServerWaits(tx);
          return (await tx.execute<{ lock: string; statement: string; idle: string }>(read)).rows[0];
        });
        if (inside?.lock !== "2s" || inside.statement !== "3s" || inside.idle !== "4s") {
          throw new Error(`inside: ${JSON.stringify(inside)}`);
        }
        const after = (await db.execute<{ lock: string; statement: string; idle: string }>(read)).rows[0];
        if (after?.lock === "2s" || after?.statement === "3s" || after?.idle === "4s") {
          throw new Error(`a limit outlived its transaction: ${JSON.stringify(after)}`);
        }
        return `inside 2s/3s/4s, afterwards ${after?.lock}/${after?.statement}/${after?.idle}`;
      }),
  },
  {
    name: "a lock wait ends on the server after 2 s (55P03)",
    run: (url) =>
      withDatabase(url, async (db) => {
        const key = lockKey();
        const holder = await holdAdvisoryLock(db, key);
        try {
          const ms = await failsWith("55P03", () =>
            db.transaction(async (tx) => {
              await limitServerWaits(tx);
              await tx.execute(sql`select pg_advisory_xact_lock(${key})`);
            }),
          );
          return `${ms} ms`;
        } finally {
          await holder.release();
        }
      }),
  },
  {
    name: "a slow statement ends on the server after 3 s (57014)",
    run: (url) =>
      withDatabase(url, async (db) => {
        const ms = await failsWith("57014", () =>
          db.transaction(async (tx) => {
            await limitServerWaits(tx);
            await tx.execute(sql`select pg_sleep(4)`);
          }),
        );
        return `${ms} ms`;
      }),
  },
  {
    name: "a transaction left idle is ended by the server, and the process survives",
    run: (url) =>
      withDatabase(url, async (db) => {
        const started = performance.now();
        try {
          await db.transaction(async (tx) => {
            await limitServerWaits(tx);
            await sleep(SERVER_LIMITS_MS.idleInTransaction + 1_000);
            await tx.execute(sql`select 1`);
          });
        } catch (error: unknown) {
          const fresh = (await db.execute<{ fresh: boolean }>(sql`select now() = statement_timestamp() as fresh`)).rows[0]?.fresh;
          if (fresh !== true) {
            throw new Error("the next statement did not start a fresh transaction");
          }
          return `ended after ${Math.round(performance.now() - started)} ms (${sqlStateOf(error) ?? describeDatabaseError(error)})`;
        }
        throw new Error("the idle transaction was not ended");
      }),
  },
  {
    name: "a client closed inside its transaction releases its locks (graceful close)",
    run: (url) =>
      withDatabase(url, async (db) => {
        const pool = createDatabasePool(url, { max: 1 });
        const key = lockKey();
        try {
          const client = await pool.connect();
          await client.query("begin");
          await client.query("select pg_advisory_xact_lock($1)", [key]);
          // What the pool does to a client released inside its transaction.
          client.release(new Error("abandoned inside a transaction"));
          return `lock free after ${await msUntilLockFree(db, key, 10_000)} ms`;
        } finally {
          await pool.end();
        }
      }),
  },
  {
    name: "a client abandoned during a statement releases its locks once the statement ends",
    run: (url) =>
      withDatabase(url, async (db) => {
        const pool = createDatabasePool(url, { max: 1 });
        const key = lockKey();
        try {
          const client = await pool.connect();
          await client.query("begin");
          await client.query(
            "select set_config('lock_timeout', '2s', true), set_config('statement_timeout', '3s', true), set_config('idle_in_transaction_session_timeout', '4s', true)",
          );
          await client.query("select pg_advisory_xact_lock($1)", [key]);
          // A statement still running when the connection is cut, as after a network stall.
          const running = client.query("select pg_sleep(10)").catch(() => undefined);
          await sleep(200);
          client.release(new Error("abandoned during a statement"));
          await running;
          return `lock free after ${await msUntilLockFree(db, key, 15_000)} ms (statement limit 3 s)`;
        } finally {
          await pool.end();
        }
      }),
  },
  {
    name: "after a double client timeout, the next borrower starts a fresh transaction",
    run: (url) =>
      withDatabase(url, async (observer) => {
        const key = lockKey();
        const holder = await holdAdvisoryLock(observer, key);
        const fresh = await withDatabase(
          url,
          async (db) => {
            try {
              // Unlimited on the server: only the client's 300 ms timeout ends it, twice.
              await db.transaction(async (tx) => tx.execute(sql`select pg_advisory_xact_lock(${key})`));
            } catch {
              // Expected: the statement, then the rollback, time out on the client.
            }
            await holder.release();
            return (await db.execute<{ fresh: boolean }>(sql`select now() = statement_timestamp() as fresh`)).rows[0]?.fresh;
          },
          300,
        );
        if (fresh !== true) {
          throw new Error("the next borrower ran inside the abandoned transaction");
        }
        return "fresh";
      }),
  },
];

async function main(): Promise<void> {
  const url = process.env.POOLED_CHECK_URL;
  if (!url) {
    throw new Error("POOLED_CHECK_URL is not set (the pooled URL of a Neon branch)");
  }
  const host = parse(url).host ?? "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !usesVerifiedTls(url)) {
    throw new Error("A remote database must use verified TLS (sslmode=verify-full)");
  }
  // The pool logs the session errors that some checks provoke on purpose.
  let failed = 0;
  for (const check of checks) {
    try {
      console.log(`PASS ${check.name}: ${await check.run(url)}`);
    } catch (error: unknown) {
      failed += 1;
      console.log(`FAIL ${check.name}: ${describeDatabaseError(error)}`);
    }
  }
  console.log(failed === 0 ? "All checks passed" : `${failed} check(s) failed`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main().catch((error: unknown) => {
  console.error("[check-pooled] failed:", describeDatabaseError(error));
  process.exit(1);
});
