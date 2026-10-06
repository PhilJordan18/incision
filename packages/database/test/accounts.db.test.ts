import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import {
  findLocalCredentials,
  findOrCreateOAuthAccount,
  readAccountProfile,
  readSessionVersion,
  revokeAccountSessions,
  type OAuthSignIn,
} from "../src/identity/accounts";
import { hashPassword } from "../src/identity/password";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  // Enough connections for the concurrent sign-ins to really overlap.
  pool = new pg.Pool({ connectionString: database.url, max: 10 });
  db = createDatabase(pool);
});

afterEach(async () => {
  await pool.query("delete from accounts");
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

const octocat: OAuthSignIn = { provider: "github", providerSubject: "583231", initialDisplayName: "The Octocat" };

async function count(table: "accounts" | "oauth_identities"): Promise<number> {
  const result = await pool.query<{ count: string }>(`select count(*) as count from ${table}`);
  return Number(result.rows[0]?.count);
}

/** Resolves once a query of this database waits on a lock (here, the unique index). */
async function waitForBlockedQuery(): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const result = await pool.query<{ count: string }>(
      "select count(*) as count from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock'",
    );
    if (Number(result.rows[0]?.count) > 0) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("No query blocked on a lock");
}

describe("findOrCreateOAuthAccount", () => {
  it("creates the account and its identity on the first sign-in, then finds the same account", async () => {
    const first = await findOrCreateOAuthAccount(db, octocat);
    expect(first.sessionVersion).toBe(1);
    expect(await readAccountProfile(db, first.accountId)).toEqual({ displayName: "The Octocat" });

    const again = await findOrCreateOAuthAccount(db, { ...octocat, initialDisplayName: "Renamed upstream" });
    expect(again).toEqual(first);
    // The provider's current name never overwrites the stored display name.
    expect(await readAccountProfile(db, first.accountId)).toEqual({ displayName: "The Octocat" });
  });

  it("waits for a concurrent first sign-in of the same identity, then reuses its account without an orphan", async () => {
    // A competing sign-in holds its uncommitted identity row: ours inserts an account, then
    // blocks on the unique index until the competitor commits, then must roll back.
    const competitor = await pool.connect();
    try {
      await competitor.query("begin");
      const inserted = await competitor.query<{ id: string }>("insert into accounts (display_name) values ('Winner') returning id");
      const winnerId = inserted.rows[0]!.id;
      await competitor.query("insert into oauth_identities (account_id, provider, provider_subject) values ($1, 'github', $2)", [
        winnerId,
        octocat.providerSubject,
      ]);
      const pending = findOrCreateOAuthAccount(db, octocat);
      await waitForBlockedQuery();
      await competitor.query("commit");
      expect(await pending).toEqual({ accountId: winnerId, sessionVersion: 1 });
    } finally {
      competitor.release();
    }
    expect(await count("accounts")).toBe(1);
    expect(await count("oauth_identities")).toBe(1);
  });

  it("ends many simultaneous first sign-ins of one identity on a single account", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => findOrCreateOAuthAccount(db, octocat)));
    expect(new Set(results.map((result) => result.accountId)).size).toBe(1);
    expect(await count("accounts")).toBe(1);
    expect(await count("oauth_identities")).toBe(1);
  });

  it("keeps a GitHub and a Discord identity with the same subject as distinct accounts (D-14)", async () => {
    const github = await findOrCreateOAuthAccount(db, octocat);
    const discord = await findOrCreateOAuthAccount(db, { ...octocat, provider: "discord" });
    expect(discord.accountId).not.toBe(github.accountId);
  });

  it("stores no email nor provider token: only the provider, its subject and our account", async () => {
    await findOrCreateOAuthAccount(db, octocat);
    const columns = await pool.query<{ table_name: string; column_name: string }>(
      "select table_name, column_name from information_schema.columns where table_schema = 'public' and table_name in ('accounts', 'oauth_identities')",
    );
    const names = columns.rows.map((row) => row.column_name);
    expect(names.filter((name) => /mail|token|secret|profile|avatar|image/i.test(name))).toEqual([]);
  });
});

describe("local credentials", () => {
  it("finds an account by canonical login, with its hash and session version", async () => {
    const passwordHash = await hashPassword("demo password");
    await pool.query("insert into accounts (login, login_canonical, display_name, password_hash) values ('Alice', 'alice', 'Alice', $1)", [
      passwordHash,
    ]);
    expect(await findLocalCredentials(db, "alice")).toMatchObject({ passwordHash, sessionVersion: 1 });
    expect(await findLocalCredentials(db, "Alice")).toBeUndefined();
    expect(await findLocalCredentials(db, "nobody")).toBeUndefined();
  });
});

describe("session versions", () => {
  it("increments the version once per revocation, also under concurrency, and touches updated_at", async () => {
    const { accountId } = await findOrCreateOAuthAccount(db, octocat);
    const before = await pool.query<{ updated_at: Date }>("select updated_at from accounts where id = $1", [accountId]);
    expect(await revokeAccountSessions(db, accountId)).toBe(2);
    await Promise.all(Array.from({ length: 5 }, () => revokeAccountSessions(db, accountId)));
    expect(await readSessionVersion(db, accountId)).toBe(7);
    const after = await pool.query<{ updated_at: Date }>("select updated_at from accounts where id = $1", [accountId]);
    expect(after.rows[0]!.updated_at.getTime()).toBeGreaterThan(before.rows[0]!.updated_at.getTime());
  });

  it("reports a deleted account as missing", async () => {
    const { accountId } = await findOrCreateOAuthAccount(db, octocat);
    await pool.query("delete from accounts where id = $1", [accountId]);
    expect(await readSessionVersion(db, accountId)).toBeNull();
    expect(await revokeAccountSessions(db, accountId)).toBeNull();
    expect(await readAccountProfile(db, accountId)).toBeUndefined();
  });
});
