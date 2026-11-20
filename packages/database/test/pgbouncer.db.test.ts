import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { sqlStateOf } from "../src/errors";
import { runMigrations } from "../src/migrations";
import { createDatabasePool, QUERY_TIMEOUT_MS } from "../src/pool";
import { boundedTransaction, SERVER_LIMITS_MS } from "../src/transaction";
import { startStallingProxy, type StallingProxy } from "./stalling-proxy";
import { localTestServerUrl } from "./test-database";

// Runs only against the isolated harness of test/pgbouncer/compose.yaml (PgBouncer 1.26 in
// transaction mode, with the settings Neon publishes), never against the shared test database:
//   docker compose -f packages/database/test/pgbouncer/compose.yaml up -d --wait
//   PGBOUNCER_TEST_URL=postgresql://incision_pgb:pgbouncer_test_only@localhost:6451/incision_pgb \
//   PGBOUNCER_DIRECT_URL=postgresql://incision_pgb:pgbouncer_test_only@localhost:5451/incision_pgb \
//   npm run test:db -w @incision/database -- test/pgbouncer.db.test.ts
// Both URLs must point to localhost: this file creates and drops a database there.
// It shows how the pool and the bounded transactions behave behind a transaction pooler. It is
// not Neon: Neon publishes only part of its pooler's configuration.
const POOLED_URL = process.env.PGBOUNCER_TEST_URL;
const DIRECT_URL = process.env.PGBOUNCER_DIRECT_URL;

/** The same URL on another database. */
function onDatabase(url: string, name: string): string {
  const target = new URL(url);
  target.pathname = `/${name}`;
  return target.toString();
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(POOLED_URL === undefined || DIRECT_URL === undefined)("behind PgBouncer in transaction mode", () => {
  const name = `incision_pgb_${randomBytes(6).toString("hex")}`;
  let pooledUrl = "";
  /** Direct connections to the same database, to hold locks and observe the server. */
  let direct: pg.Pool;
  const opened: pg.Pool[] = [];
  const proxies: StallingProxy[] = [];

  beforeAll(async () => {
    localTestServerUrl(POOLED_URL);
    localTestServerUrl(DIRECT_URL);
    const server = new pg.Client({ connectionString: DIRECT_URL });
    await server.connect();
    await server.query(`create database "${name}"`);
    await server.end();
    const directUrl = onDatabase(DIRECT_URL ?? "", name);
    await runMigrations({ connectionString: directUrl });
    pooledUrl = onDatabase(POOLED_URL ?? "", name);
    // Named, so that ending the server sessions of this database spares the observer.
    direct = new pg.Pool({ connectionString: directUrl, max: 4, application_name: "pgbouncer-test-observer" });
    direct.on("error", () => undefined);
    await direct.query("create table probe (id integer primary key, value integer not null)");
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    for (const pool of opened.splice(0)) {
      await pool.end();
    }
    for (const proxy of proxies.splice(0)) {
      await proxy.close();
    }
    await direct.query("delete from probe");
  });

  afterAll(async () => {
    await direct.end();
    const server = new pg.Client({ connectionString: DIRECT_URL });
    await server.connect();
    await server.query(`drop database if exists "${name}" with (force)`);
    await server.end();
  });

  function appPool(url: string, queryTimeoutMs = QUERY_TIMEOUT_MS): { pool: pg.Pool; db: Database } {
    const pool = createDatabasePool(url, { max: 1, queryTimeoutMs });
    opened.push(pool);
    return { pool, db: createDatabase(pool) };
  }

  async function proxied(): Promise<StallingProxy> {
    const proxy = await startStallingProxy(pooledUrl);
    proxies.push(proxy);
    return proxy;
  }

  /** Server sessions of this database left inside a transaction (the observer excluded). */
  async function sessionsInTransaction(): Promise<number> {
    const { rows } = await direct.query<{ count: string }>(
      "select count(*) as count from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() and state like 'idle in transaction%'",
    );
    return Number(rows[0]?.count);
  }

  /** How long until the probe row can be locked again, polled from a direct connection. */
  async function msUntilRowFree(giveUpMs: number): Promise<number> {
    const started = performance.now();
    while (performance.now() - started < giveUpMs) {
      const client = await direct.connect();
      try {
        await client.query("begin");
        await client.query("set local lock_timeout = '100ms'");
        await client.query("select 1 from probe where id = 1 for update");
        await client.query("rollback");
        return Math.round(performance.now() - started);
      } catch (error: unknown) {
        await client.query("rollback").catch(() => undefined);
        if (sqlStateOf(error) !== "55P03") {
          throw error;
        }
      } finally {
        client.release();
      }
      await sleep(50);
    }
    return Number.POSITIVE_INFINITY;
  }

  async function startsFresh(db: Database): Promise<boolean> {
    const { rows } = await db.execute<{ fresh: boolean }>(sql`select now() = statement_timestamp() as fresh`);
    return rows[0]?.fresh === true;
  }

  async function probeRows(): Promise<{ id: number; value: number }[]> {
    return (await direct.query<{ id: number; value: number }>("select id, value from probe order by id")).rows;
  }

  it("applies the server limits to their transaction only, on the same server session", async () => {
    const { db } = appPool(pooledUrl);
    const read = sql`select pg_backend_pid() as pid, current_setting('lock_timeout') as lock, current_setting('statement_timeout') as statement, current_setting('idle_in_transaction_session_timeout') as idle`;
    const inside = await boundedTransaction(db, async (tx) => (await tx.execute<{ pid: number; lock: string; statement: string; idle: string }>(read)).rows[0]);
    expect(inside).toMatchObject({ lock: "2s", statement: "3s", idle: "4s" });
    let after: { pid: number; lock: string } | undefined;
    for (let attempt = 0; attempt < 10 && after?.pid !== inside?.pid; attempt += 1) {
      after = (await db.execute<{ pid: number; lock: string; statement: string; idle: string }>(read)).rows[0];
    }
    expect(after).toMatchObject({ pid: inside?.pid, lock: "0", statement: "0", idle: "0" });
  });

  it("ends lock waits and slow statements on the server, before the client timeout", async () => {
    await direct.query("insert into probe values (1, 0)");
    const { db } = appPool(pooledUrl);
    const holder = await direct.connect();
    try {
      await holder.query("begin");
      await holder.query("select 1 from probe where id = 1 for update");
      const started = performance.now();
      const state = await boundedTransaction(db, (tx) => tx.execute(sql`update probe set value = 1 where id = 1`)).then(
        () => "committed",
        (error: unknown) => sqlStateOf(error),
      );
      expect(state).toBe("55P03");
      expect(performance.now() - started).toBeLessThan(QUERY_TIMEOUT_MS);
    } finally {
      await holder.query("rollback");
      holder.release();
    }
    const slow = await boundedTransaction(db, (tx) => tx.execute(sql`select pg_sleep(${SERVER_LIMITS_MS.statement / 1000 + 1})`)).then(
      () => "finished",
      (error: unknown) => sqlStateOf(error),
    );
    expect(slow).toBe("57014");
    expect(await startsFresh(db)).toBe(true);
  });

  it("rolls back a transaction whose answers stall between the application and PgBouncer", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await direct.query("insert into probe values (1, 0)");
    const proxy = await proxied();
    const { db } = appPool(proxy.url, 300);
    await expect(
      db.transaction(async (tx) => {
        proxy.stall();
        await tx.execute(sql`update probe set value = 1 where id = 1`);
      }),
    ).rejects.toThrow();
    proxy.resume();
    // PgBouncer saw its client leave in the middle of a transaction and closed the server side.
    expect(await msUntilRowFree(3_000)).toBeLessThan(1_000);
    await db.transaction(async (tx) => tx.execute(sql`insert into probe values (2, 2)`));
    expect(await probeRows()).toEqual([
      { id: 1, value: 0 },
      { id: 2, value: 2 },
    ]);
    expect(await sessionsInTransaction()).toBe(0);
  });

  it("frees the slot of a BEGIN that never comes back, and leaves no server session in a transaction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const proxy = await proxied();
    const { pool, db } = appPool(proxy.url, 300);
    expect(await startsFresh(db)).toBe(true);
    proxy.stall();
    const begun = performance.now();
    await expect(db.transaction(async (tx) => tx.execute(sql`select 1`))).rejects.toThrow();
    expect(performance.now() - begun).toBeLessThan(2_000);
    expect(pool.totalCount).toBe(0);
    proxy.resume();
    expect(await startsFresh(db)).toBe(true);
    await sleep(200);
    expect(await sessionsInTransaction()).toBe(0);
  });

  it("frees the locks of a connection cut during a statement once the statement limit ends it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await direct.query("insert into probe values (1, 0)");
    const proxy = await proxied();
    const { db } = appPool(proxy.url);
    const work = boundedTransaction(db, async (tx) => {
      await tx.execute(sql`update probe set value = 1 where id = 1`);
      await tx.execute(sql`select pg_sleep(10)`);
    }).catch(() => undefined);
    await sleep(300);
    proxy.cut();
    await work;
    // The backend notices its client only when the statement ends: at its 3 s limit.
    expect(await msUntilRowFree(8_000)).toBeLessThan(SERVER_LIMITS_MS.statement + 1_000);
    expect(await probeRows()).toEqual([{ id: 1, value: 0 }]);
  });

  it("ends a bounded transaction whose client vanished without a word (black hole) at the idle limit", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await direct.query("insert into probe values (1, 0)");
    const proxy = await proxied();
    const { db } = appPool(proxy.url, 300);
    proxy.blackHole();
    let idleSince = 0;
    await expect(
      boundedTransaction(db, async (tx) => {
        await tx.execute(sql`update probe set value = 1 where id = 1`);
        proxy.stall();
        // The server's idle timer starts once this statement ends, which is now.
        idleSince = performance.now();
        await tx.execute(sql`select 1`);
      }),
    ).rejects.toThrow();
    // PgBouncer still believes its client alive: only the server's idle limit (4 s) frees the row.
    await msUntilRowFree(10_000);
    const ms = performance.now() - idleSince;
    expect(ms).toBeGreaterThan(SERVER_LIMITS_MS.idleInTransaction - 500);
    expect(ms).toBeLessThan(SERVER_LIMITS_MS.idleInTransaction + 2_000);
    expect(await probeRows()).toEqual([{ id: 1, value: 0 }]);
  });

  it("without the server limits, a black-holed transaction keeps its locks: PgBouncer's defaults do not end it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    await direct.query("insert into probe values (1, 0)");
    const proxy = await proxied();
    const { db } = appPool(proxy.url, 300);
    proxy.blackHole();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`update probe set value = 1 where id = 1`);
        proxy.stall();
        await tx.execute(sql`select 1`);
      }),
    ).rejects.toThrow();
    expect(await msUntilRowFree(SERVER_LIMITS_MS.idleInTransaction + 3_000)).toBe(Number.POSITIVE_INFINITY);
    // Once the lost close finally arrives, PgBouncer drops the server side and the row is free.
    await proxy.close();
    expect(await msUntilRowFree(3_000)).toBeLessThan(1_000);
    expect(await probeRows()).toEqual([{ id: 1, value: 0 }]);
  });

  it("survives the server ending a session, idle in the pool or in a transaction", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { pool, db } = appPool(pooledUrl);
    const terminateServers = () =>
      direct.query(
        "select pg_terminate_backend(pid, 5000) from pg_stat_activity where datname = current_database() and application_name <> 'pgbouncer-test-observer'",
      );
    // Idle in the application's pool: PgBouncer simply opens another server session.
    expect(await startsFresh(db)).toBe(true);
    await terminateServers();
    await sleep(200);
    expect(await startsFresh(db)).toBe(true);
    // Checked out, in a transaction, no query running: PgBouncer closes the client too.
    await expect(
      db.transaction(async (tx) => {
        await tx.execute(sql`select 1`);
        await terminateServers();
        await sleep(300);
        await tx.execute(sql`select 1`);
      }),
    ).rejects.toThrow();
    expect(pool.totalCount).toBe(0);
    expect(await startsFresh(db)).toBe(true);
    expect(await sessionsInTransaction()).toBe(0);
  });

  it("leaves no client waiting and no server busy in PgBouncer afterwards", async () => {
    const admin = new pg.Client({ connectionString: onDatabase(POOLED_URL ?? "", "pgbouncer") });
    await admin.connect();
    try {
      // PgBouncer releases a server at the end of its transaction; give it a moment.
      await sleep(200);
      const { rows } = await admin.query<{ database: string; cl_active: string; cl_waiting: string; sv_active: string }>("SHOW POOLS");
      const ours = rows.filter((row) => row.database === name);
      expect(ours.length).toBeGreaterThan(0);
      for (const pool of ours) {
        // No client left behind by the black holes, none waiting, no server busy.
        expect(Number(pool.cl_active)).toBe(0);
        expect(Number(pool.cl_waiting)).toBe(0);
        expect(Number(pool.sv_active)).toBe(0);
      }
    } finally {
      await admin.end();
    }
  });
});
