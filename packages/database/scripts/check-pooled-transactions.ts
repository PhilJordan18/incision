import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import type pg from "pg";
import { parse } from "pg-connection-string";
import { createDatabase, type Database } from "../src/client";
import { sqlStateOf } from "../src/errors";
import { createDatabasePool, describeDatabaseError } from "../src/pool";
import { usesVerifiedTls } from "../src/tls";
import { boundedTransaction, SERVER_LIMITS_MS } from "../src/transaction";

// Usage (docs/DEPLOYMENT.md, "Connexions et transactions"), from the repository root: type the
// pooled URL of a Neon branch at the prompt, never on the command line:
//   ( printf 'URL poolée : ' >&2; read -rs POOLED_CHECK_URL && export POOLED_CHECK_URL && echo >&2 && npm run db:check-pooled -w @incision/database )
//
// Checks, through the real connection path (Neon's PgBouncer in transaction mode), what the
// pool and the transactions rely on. It reads and writes no table: it only takes
// transaction-level advisory locks (in a key space of its own), sleeps and reads settings.
// The URL is never printed, and no .env file is read.

type Check = { readonly name: string; readonly run: (url: string) => Promise<string> };

/** Advisory locks in the two-key form, a space apart from the migrator's single-key lock. */
const LOCK_CLASS = 4004;
const lockKey = () => randomInt(1, 2 ** 31);
const CHECK_LIMIT_MS = 30_000;
const WHOLE_RUN_LIMIT_MS = 5 * 60_000;
const IDLE_LIMIT = `${SERVER_LIMITS_MS.idleInTransaction}ms`;
const LIMITS_SQL = `select set_config('lock_timeout', '${SERVER_LIMITS_MS.lock}ms', true), set_config('statement_timeout', '${SERVER_LIMITS_MS.statement}ms', true), set_config('idle_in_transaction_session_timeout', '${IDLE_LIMIT}', true)`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `work` on a fresh pool of the application, then closes it. */
async function withPool<T>(
  url: string,
  work: (db: Database, pool: pg.Pool) => Promise<T>,
  overrides: Parameters<typeof createDatabasePool>[1] = {},
): Promise<T> {
  const pool = createDatabasePool(url, { max: 2, ...overrides });
  try {
    return await work(createDatabase(pool), pool);
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
      throw new Error(`expected ${expected}, got ${state ?? describeDatabaseError(error)}`);
    }
    return Math.round(performance.now() - started);
  }
  throw new Error(`expected ${expected}, but it succeeded`);
}

/** Another connection holds the advisory lock `key` until `release`; bounded on the server. */
async function holdAdvisoryLock(db: Database, key: number): Promise<{ release: () => Promise<void> }> {
  const taken = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();
  const holder = db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('idle_in_transaction_session_timeout', '30s', true)`);
    await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_CLASS}, ${key})`);
    taken.resolve();
    await released.promise;
  });
  await Promise.race([taken.promise, holder]);
  return {
    release: async () => {
      released.resolve();
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
        await tx.execute(sql`select pg_advisory_xact_lock(${LOCK_CLASS}, ${key})`);
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

type Settings = { pid: number; lock: string; statement: string; idle: string };
const readSettings = sql`select pg_backend_pid() as pid, current_setting('lock_timeout') as lock, current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle`;

const checks: readonly Check[] = [
  {
    name: "the limits apply to their transaction only, on the same server session",
    run: (url) =>
      withPool(url, async (db) => {
        const inside = await boundedTransaction(db, async (tx) => (await tx.execute<Settings>(readSettings)).rows[0]);
        if (inside?.lock !== "2s" || inside.statement !== "3s" || inside.idle !== "4s") {
          throw new Error(`inside: ${JSON.stringify(inside)}`);
        }
        // Through PgBouncer the next statement may reach another server session: try a few times.
        for (let attempt = 0; attempt < 10; attempt += 1) {
          const after = (await db.execute<Settings>(readSettings)).rows[0];
          if (after?.pid === inside.pid) {
            if (after.lock === "2s" || after.statement === "3s" || after.idle === "4s") {
              throw new Error(`a limit outlived its transaction: ${JSON.stringify(after)}`);
            }
            return `inside 2s/3s/4s, then ${after.lock}/${after.statement}/${after.idle} on the same session`;
          }
        }
        throw new Error("never reached the same server session again; inconclusive");
      }),
  },
  {
    name: "a lock wait ends on the server after 2 s (55P03)",
    run: (url) =>
      withPool(url, async (db) => {
        const key = lockKey();
        const holder = await holdAdvisoryLock(db, key);
        try {
          const ms = await failsWith("55P03", () => boundedTransaction(db, (tx) => tx.execute(sql`select pg_advisory_xact_lock(${LOCK_CLASS}, ${key})`)));
          return `after ${ms} ms`;
        } finally {
          await holder.release();
        }
      }),
  },
  {
    name: "a slow statement ends on the server after 3 s (57014)",
    run: (url) =>
      withPool(url, async (db) => {
        const ms = await failsWith("57014", () => boundedTransaction(db, (tx) => tx.execute(sql`select pg_sleep(${SERVER_LIMITS_MS.statement / 1000 + 1})`)));
        return `after ${ms} ms`;
      }),
  },
  {
    name: "a transaction left idle is ended by the server (25P03), and the process survives",
    run: async (url) => {
      const codes: string[] = [];
      return withPool(url, async (db, pool) => {
        pool.on("connect", (client) => client.on("error", (error) => codes.push(sqlStateOf(error) ?? "none")));
        const started = performance.now();
        try {
          await boundedTransaction(db, async (tx) => {
            await sleep(SERVER_LIMITS_MS.idleInTransaction + 1_000);
            await tx.execute(sql`select 1`);
          });
        } catch {
          const elapsed = Math.round(performance.now() - started);
          if (!codes.includes("25P03")) {
            throw new Error(`the session was not ended by the idle limit (errors heard: ${codes.join(", ") || "none"})`);
          }
          const fresh = (await db.execute<{ fresh: boolean }>(sql`select now() = statement_timestamp() as fresh`)).rows[0]?.fresh;
          if (fresh !== true) {
            throw new Error("the next statement did not start a fresh transaction");
          }
          return `ended with 25P03, transaction failed after ${elapsed} ms`;
        }
        throw new Error("the idle transaction was not ended");
      });
    },
  },
  {
    name: "a client released inside its transaction is discarded and its locks are freed",
    run: (url) =>
      withPool(url, async (db) =>
        withPool(
          url,
          async (_unused, pool) => {
            const key = lockKey();
            const client = await pool.connect();
            await client.query("begin");
            await client.query("select pg_advisory_xact_lock($1, $2)", [LOCK_CLASS, key]);
            // The guard decides: inside a transaction, the client is destroyed.
            client.release();
            if (pool.totalCount !== 0) {
              throw new Error("the client was kept in the pool");
            }
            return `lock free after ${await msUntilLockFree(db, key, 10_000)} ms`;
          },
          { max: 1 },
        ),
      ),
  },
  {
    name: "a client cut off during a statement frees its locks once the statement limit ends it",
    run: (url) =>
      withPool(url, async (db) =>
        withPool(
          url,
          async (_unused, pool) => {
            const key = lockKey();
            const client = await pool.connect();
            await client.query("begin");
            await client.query(LIMITS_SQL);
            await client.query("select pg_advisory_xact_lock($1, $2)", [LOCK_CLASS, key]);
            // Still running when the connection is closed, as after a network stall.
            const running = client.query("select pg_sleep(10)").catch(() => undefined);
            await sleep(200);
            client.release();
            await running;
            const ms = await msUntilLockFree(db, key, 15_000);
            if (ms > SERVER_LIMITS_MS.statement + 1_500) {
              throw new Error(`the lock stayed held ${ms} ms, beyond the statement limit`);
            }
            return `lock free after ${ms} ms (statement limit ${SERVER_LIMITS_MS.statement} ms)`;
          },
          { max: 1 },
        ),
      ),
  },
  {
    name: "after a client timeout, the next borrower starts fresh and the abandoned session ends",
    run: (url) =>
      withPool(url, async (observer) => {
        const key = lockKey();
        const holder = await holdAdvisoryLock(observer, key);
        return withPool(
          url,
          async (db, pool) => {
            try {
              // Unlimited on the server: only the client's 1 s timeout ends it.
              await db.transaction(async (tx) => tx.execute(sql`select pg_advisory_xact_lock(${LOCK_CLASS}, ${key})`));
            } catch {
              // Expected: the statement times out on the client.
            }
            await holder.release();
            const fresh = (await db.execute<{ fresh: boolean }>(sql`select now() = statement_timestamp() as fresh`)).rows[0]?.fresh;
            if (fresh !== true) {
              throw new Error("the next borrower ran inside the abandoned transaction");
            }
            // The abandoned session took the lock once released; it must lose it when its session ends.
            const ms = await msUntilLockFree(observer, key, 15_000);
            return `fresh, ${pool.totalCount} connection(s) in the pool; the abandoned session's lock freed after ${ms} ms`;
          },
          { max: 1, queryTimeoutMs: 1_000 },
        );
      }),
  },
];

/** Runs one check, failing it if it outlasts `CHECK_LIMIT_MS`. */
async function runCheck(check: Check, url: string): Promise<string> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer after ${CHECK_LIMIT_MS} ms`)), CHECK_LIMIT_MS);
  });
  try {
    return await Promise.race([check.run(url), limit]);
  } finally {
    clearTimeout(timer);
  }
}

async function main(): Promise<void> {
  const url = process.env.POOLED_CHECK_URL;
  if (!url) {
    throw new Error("POOLED_CHECK_URL is not set (the pooled URL of a Neon branch)");
  }
  const host = parse(url).host ?? "";
  if (!["localhost", "127.0.0.1", "::1"].includes(host) && !usesVerifiedTls(url)) {
    throw new Error("A remote database must use verified TLS (sslmode=verify-full)");
  }
  setTimeout(() => {
    console.log(`FAIL the whole run took longer than ${WHOLE_RUN_LIMIT_MS} ms`);
    process.exit(2);
  }, WHOLE_RUN_LIMIT_MS).unref();
  // The pool logs the session errors that some checks provoke on purpose.
  let failed = 0;
  for (const check of checks) {
    try {
      console.log(`PASS ${check.name}: ${await runCheck(check, url)}`);
    } catch (error: unknown) {
      failed += 1;
      console.log(`FAIL ${check.name}: ${describeDatabaseError(error)}`);
    }
  }
  console.log(failed === 0 ? "All checks passed" : `${failed} check(s) failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error("[check-pooled] failed:", describeDatabaseError(error));
  process.exit(1);
});
