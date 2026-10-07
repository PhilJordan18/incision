import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { findLocalCredentials } from "../src/identity/accounts";
import { DEMO_ACCOUNTS, seedDemoAccounts } from "../src/identity/demo-accounts";
import { hashPassword, verifyPassword } from "../src/identity/password";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
  db = createDatabase(pool);
});

afterEach(async () => {
  await pool.query("delete from accounts");
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

describe("seedDemoAccounts", () => {
  it("creates the demo accounts, which then open with their published password", async () => {
    const outcomes = await seedDemoAccounts(db);
    expect([...outcomes.values()]).toEqual(DEMO_ACCOUNTS.map(() => "created"));
    for (const demo of DEMO_ACCOUNTS) {
      const credentials = await findLocalCredentials(db, demo.login.toLowerCase());
      expect(credentials?.passwordHash).toBeTruthy();
      expect(await verifyPassword(demo.password, credentials?.passwordHash ?? "")).toBe(true);
    }
  });

  it("is idempotent: a second run changes nothing", async () => {
    await seedDemoAccounts(db);
    const before = await pool.query("select id, password_hash, session_version, updated_at from accounts order by login");
    const outcomes = await seedDemoAccounts(db);
    expect([...outcomes.values()]).toEqual(DEMO_ACCOUNTS.map(() => "unchanged"));
    const after = await pool.query("select id, password_hash, session_version, updated_at from accounts order by login");
    expect(after.rows).toEqual(before.rows);
  });

  it("never overwrites an account that uses a demo login but is not the demo account", async () => {
    const [demo] = DEMO_ACCOUNTS;
    const ownHash = await hashPassword("someone else's password");
    await pool.query("insert into accounts (login, login_canonical, display_name, password_hash) values ($1, $2, 'Someone', $3)", [
      demo!.login.toUpperCase(),
      demo!.login.toLowerCase(),
      ownHash,
    ]);
    const outcomes = await seedDemoAccounts(db, [demo!]);
    expect(outcomes.get(demo!.login)).toBe("conflict");
    const kept = await pool.query<{ display_name: string; password_hash: string }>("select display_name, password_hash from accounts");
    expect(kept.rows).toEqual([{ display_name: "Someone", password_hash: ownHash }]);
  });
});
