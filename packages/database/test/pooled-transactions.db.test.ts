import { randomInt } from "node:crypto";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { findOrCreateOAuthAccount } from "../src/identity/accounts";
import { runMigrations } from "../src/migrations";
import { sqlStateOf } from "../src/errors";
import { createDatabasePool, QUERY_TIMEOUT_MS } from "../src/pool";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode, leaveCurrentRoom } from "../src/rooms/membership";
import { limitServerWaits, SERVER_LIMITS_MS } from "../src/transaction";
import { startStallingProxy } from "./stalling-proxy";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
/** Unguarded connections for setting up, holding locks and observing. */
let admin: pg.Pool;
const opened: pg.Pool[] = [];

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  admin = new pg.Pool({ connectionString: database.url, max: 4 });
  await admin.query("create table probe (id integer primary key, value integer not null)");
});

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(opened.splice(0).map((pool) => pool.end()));
  await admin.query("delete from probe");
  await admin.query("update lobbies set host_member_id = null");
  await admin.query("delete from lobbies");
  await admin.query("delete from accounts");
});

afterAll(async () => {
  await admin.end();
  await database.drop();
});

/** The application's pool, with one connection so that the next borrower reuses it. */
function appPool(url: string, queryTimeoutMs = QUERY_TIMEOUT_MS, checkoutLimitMs?: number): { pool: pg.Pool; db: Database } {
  const pool = createDatabasePool(url, { max: 1, queryTimeoutMs, checkoutLimitMs });
  opened.push(pool);
  return { pool, db: createDatabase(pool) };
}

/** Ends a pool before its proxy closes, so no late error lands after the test. */
async function endPool(pool: pg.Pool): Promise<void> {
  opened.splice(opened.indexOf(pool), 1);
  await pool.end();
}

/** Waits until `console.error` (mocked) was called with a line that contains `text`. */
async function loggedSoon(text: string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (vi.mocked(console.error).mock.calls.some((call) => call.join(" ").includes(text))) {
      return;
    }
    await sleep(20);
  }
  throw new Error(`Never logged: ${text}`);
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));


async function failureOf(work: () => Promise<unknown>): Promise<{ state: string | undefined; elapsedMs: number }> {
  const started = performance.now();
  try {
    await work();
  } catch (error: unknown) {
    return { state: sqlStateOf(error), elapsedMs: performance.now() - started };
  }
  throw new Error("Expected the work to fail");
}

/** Another session holds `statement`'s locks until `release`. */
async function holding(statement: string): Promise<{ release: () => Promise<void> }> {
  const client = await admin.connect();
  await client.query("begin");
  await client.query(statement);
  let released = false;
  return {
    release: async () => {
      if (!released) {
        released = true;
        await client.query("commit");
        client.release();
      }
    },
  };
}

async function probeRows(): Promise<{ id: number; value: number }[]> {
  return (await admin.query<{ id: number; value: number }>("select id, value from probe order by id")).rows;
}

/** No session of the database is still inside a transaction, apart from the observer's. */
async function noOpenTransactionLeft(): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const { rows } = await admin.query<{ count: string }>(
      "select count(*) as count from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state like 'idle in transaction%'",
    );
    if (Number(rows[0]?.count) === 0) {
      return;
    }
    await sleep(50);
  }
  throw new Error("A session is still idle in a transaction");
}

async function backendPid(db: Database): Promise<number | undefined> {
  return (await db.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid;
}

/** True when a statement starts its own transaction, not one left open by someone else. */
async function startsFresh(db: Database): Promise<boolean> {
  const { rows } = await db.execute<{ fresh: boolean }>(sql`select now() = statement_timestamp() as fresh`);
  return rows[0]?.fresh === true;
}

async function account(name: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [name]);
  const id = rows[0]?.id;
  if (id === undefined) {
    throw new Error("no account");
  }
  return id;
}

describe("the application's pool", () => {
  it("never hands out a connection whose transaction was abandoned after a double client timeout", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await admin.query("insert into probe values (1, 0)");
    const { db } = appPool(database.url, 300);
    let abandonedPid: number | undefined;
    const lock = await holding("select 1 from probe where id = 1 for update");
    try {
      // Blocked on the row: the update times out on the client.
      await expect(
        db.transaction(async (tx) => {
          abandonedPid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid;
          await tx.execute(sql`update probe set value = 1 where id = 1`);
        }),
      ).rejects.toThrow();
    } finally {
      await lock.release();
    }
    // The next borrower, on another connection, commits its own work only.
    await db.transaction(async (tx) => tx.execute(sql`insert into probe values (2, 2)`));
    await noOpenTransactionLeft();
    expect(await probeRows()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 2 },
    ]);
    expect(await backendPid(db)).not.toBe(abandonedPid);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[database] client discarded: query failed on the client"));
  });

  it("never hands out a connection whose transaction a network stall interrupted", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await admin.query("insert into probe values (1, 0)");
    const proxy = await startStallingProxy(database.url);
    const { pool, db } = appPool(proxy.url, 300);
    try {
      let abandonedPid: number | undefined;
      // The update reaches the server and runs; its answer never comes back.
      await expect(
        db.transaction(async (tx) => {
          abandonedPid = (await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`)).rows[0]?.pid;
          proxy.stall();
          await tx.execute(sql`update probe set value = 1 where id = 1`);
        }),
      ).rejects.toThrow();
      proxy.resume();
      await db.transaction(async (tx) => tx.execute(sql`insert into probe values (2, 2)`));
      await noOpenTransactionLeft();
      expect(await probeRows()).toEqual([
        { id: 1, value: 0 },
        { id: 2, value: 2 },
      ]);
      expect(await backendPid(db)).not.toBe(abandonedPid);
      expect(console.error).toHaveBeenCalledWith(expect.stringContaining("[database] client discarded: query failed on the client"));
    } finally {
      await endPool(pool);
      await proxy.close();
    }
  });

  it("frees the slot of a transaction whose BEGIN never comes back, or whose connection is cut during it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const proxy = await startStallingProxy(database.url);
    const { pool, db } = appPool(proxy.url, 300);
    try {
      // Drizzle sends BEGIN before its own error handling: it never releases a client whose BEGIN fails.
      proxy.stall();
      await expect(db.transaction(async (tx) => tx.execute(sql`select 1`))).rejects.toThrow();
      proxy.resume();
      expect(pool.totalCount).toBe(0);
      expect(await startsFresh(db)).toBe(true);

      proxy.stall();
      const cut = db.transaction(async (tx) => tx.execute(sql`select 1`));
      await sleep(50);
      proxy.cut();
      await expect(cut).rejects.toThrow();
      proxy.resume();
      expect(pool.totalCount).toBe(0);
      expect(await startsFresh(db)).toBe(true);
      await noOpenTransactionLeft();
    } finally {
      await endPool(pool);
      await proxy.close();
    }
  });

  it("never reuses a connection released inside its transaction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await admin.query("insert into probe values (1, 0)");
    const { pool, db } = appPool(database.url);
    const client = await pool.connect();
    await client.query("begin");
    await client.query("update probe set value = 1 where id = 1");
    client.release();
    expect(pool.totalCount).toBe(0);
    expect(console.error).toHaveBeenCalledWith("[database] client discarded: released inside a transaction");
    await db.transaction(async (tx) => tx.execute(sql`insert into probe values (2, 2)`));
    await noOpenTransactionLeft();
    expect(await probeRows()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 2 },
    ]);
  });

  it("never reuses a connection released with a query still in flight", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(database.url);
    const client = await pool.connect();
    await client.query("begin");
    await client.query("commit");
    // Idle as far as pg knows, but a statement is still running on the server.
    const running = client.query("begin; select pg_sleep(1)").catch(() => undefined);
    expect(client.getTransactionStatus()).toBe("I");
    client.release();
    await running;
    expect(pool.totalCount).toBe(0);
    expect(console.error).toHaveBeenCalledWith("[database] client discarded: released with a query in flight");
    expect(await startsFresh(db)).toBe(true);
    await noOpenTransactionLeft();
  });

  it("frees the slot of a checked-out client whose session the server ends, before its holder notices", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(database.url);
    const client = await pool.connect();
    const { rows } = await client.query<{ pid: number }>("select pg_backend_pid() as pid");
    await admin.query("select pg_terminate_backend($1)", [rows[0]?.pid]);
    await sleep(300);
    expect(pool.totalCount).toBe(0);
    expect(await startsFresh(db)).toBe(true);
    // The holder's own release, later, changes nothing.
    client.release();
    expect(pool.totalCount).toBe(1);
  });

  it("reuses a connection after a commit or after an error answered by the server", async () => {
    const { db } = appPool(database.url);
    const first = await backendPid(db);
    await db.transaction(async (tx) => tx.execute(sql`select 1`));
    expect(await backendPid(db)).toBe(first);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        throw new Error("the caller gives up");
      }),
    ).rejects.toThrow("the caller gives up");
    expect(await backendPid(db)).toBe(first);
    await expect(db.transaction(async (tx) => tx.execute(sql`select 1 / 0`))).rejects.toThrow();
    expect(await backendPid(db)).toBe(first);
  });

  it("reclaims a connection held longer than the checkout limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(database.url, QUERY_TIMEOUT_MS, 300);
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        await sleep(600);
        await tx.execute(sql`select 1`);
      }),
    ).rejects.toThrow();
    expect(pool.totalCount).toBe(0);
    expect(console.error).toHaveBeenCalledWith("[database] client discarded: held longer than 300 ms");
    expect(await startsFresh(db)).toBe(true);
    await noOpenTransactionLeft();
  });

  it("survives the server ending the session of a checked-out client that runs no query", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(database.url);
    await expect(
      db.transaction(async (tx) => {
        const { rows } = await tx.execute<{ pid: number }>(sql`select pg_backend_pid() as pid`);
        // Waits until the backend has exited, then for the client to hear it while no query runs.
        await admin.query("select pg_terminate_backend($1, 5000)", [rows[0]?.pid]);
        await loggedSoon("57P01");
        await tx.execute(sql`select 1`);
      }),
    ).rejects.toThrow();
    expect(pool.totalCount).toBe(0);
    expect(await startsFresh(db)).toBe(true);
    expect(console.error).toHaveBeenCalledWith("[database] client error:", expect.stringContaining("57P01"));
  });

  it("survives the server ending the session of a client idle in the pool", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(database.url);
    const pid = await backendPid(db);
    const removed = new Promise((resolve) => pool.once("remove", resolve));
    // As when Neon suspends its compute: pg-pool reports the error of an idle client on the pool.
    await admin.query("select pg_terminate_backend($1, 5000)", [pid]);
    await removed;
    expect(pool.totalCount).toBe(0);
    expect(console.error).toHaveBeenCalledWith("[database] client error:", expect.stringContaining("57P01"));
    expect(await backendPid(db)).not.toBe(pid);
  });

  it("lets the server end a transaction left idle, without crashing", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(database.url);
    await expect(
      db.transaction(async (tx) => {
        await limitServerWaits(tx);
        await sleep(SERVER_LIMITS_MS.idleInTransaction + 500);
        await tx.execute(sql`select 1`);
      }),
    ).rejects.toThrow();
    expect(pool.totalCount).toBe(0);
    expect(await startsFresh(db)).toBe(true);
    expect(console.error).toHaveBeenCalledWith("[database] client error:", expect.stringContaining("25P03"));
  });

  it("sets the server limits for the transaction only", async () => {
    const { db } = appPool(database.url);
    const settings = sql`select current_setting('lock_timeout') as lock, current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle`;
    const inside = await db.transaction(async (tx) => {
      await limitServerWaits(tx);
      return (await tx.execute(settings)).rows[0];
    });
    expect(inside).toEqual({ lock: "2s", statement: "3s", idle: "4s" });
    // The same connection afterwards: back to the server's defaults.
    expect((await db.execute(settings)).rows[0]).toEqual({ lock: "0", statement: "0", idle: "0" });
  });
});

describe("room and account transactions", () => {
  async function roomOf(hostId: string, db: Database) {
    const created = await createRoomWithHost(db, { accountId: hostId, role: "participant", visibility: "code", capacity: 30, randomIndex: randomInt });
    if (!created.ok) {
      throw new Error(created.error);
    }
    return created.room;
  }

  it("end a lock wait on the server, before the client timeout, and leave the connection clean", async () => {
    const setup = createDatabase(admin);
    const host = await account("Hôte");
    const guest = await account("Invitée");
    const room = await roomOf(host, setup);
    const { db } = appPool(database.url);

    const waits: [string, string, () => Promise<unknown>][] = [
      ["admission", "select 1 from lobbies for update", () => joinRoomByCode(db, { accountId: guest, code: room.code, role: "participant" })],
      ["departure", "select 1 from lobbies for update", () => leaveCurrentRoom(db, host)],
      ["creation", "lock table lobbies in share mode", async () => roomOf(await account("Autre"), db)],
      [
        "first OAuth sign-in",
        "lock table oauth_identities in share mode",
        () => findOrCreateOAuthAccount(db, { provider: "github", providerSubject: "subject-1", initialDisplayName: "Octo" }),
      ],
    ];
    for (const [name, statement, work] of waits) {
      const lock = await holding(statement);
      let outcome: Awaited<ReturnType<typeof failureOf>>;
      try {
        outcome = await failureOf(work);
      } finally {
        await lock.release();
      }
      // lock_not_available, raised by the server after its own limit.
      expect(outcome.state, name).toBe("55P03");
      expect(outcome.elapsedMs, name).toBeGreaterThanOrEqual(SERVER_LIMITS_MS.lock - 100);
      expect(outcome.elapsedMs, name).toBeLessThan(QUERY_TIMEOUT_MS);
      expect(await startsFresh(db), name).toBe(true);
    }
  });
});
