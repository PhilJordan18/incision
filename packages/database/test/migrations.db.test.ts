import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { MIGRATION_LOCK_KEY, MIGRATIONS_FOLDER, runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;

beforeEach(async () => {
  database = await createTemporaryDatabase();
});

afterEach(async () => {
  await database.drop();
});

async function query<Row extends pg.QueryResultRow>(sql: string): Promise<Row[]> {
  const client = new pg.Client({ connectionString: database.url });
  await client.connect();
  try {
    return (await client.query<Row>(sql)).rows;
  } finally {
    await client.end();
  }
}

async function tableExists(name: string): Promise<boolean> {
  const [row] = await query<{ exists: boolean }>(`select to_regclass('public.${name}') is not null as exists`);
  return row?.exists === true;
}

/** Number of migrations shipped by the package (entries of its Drizzle journal). */
function releasedMigrationCount(): number {
  const journal: unknown = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"));
  if (typeof journal !== "object" || journal === null || !("entries" in journal) || !Array.isArray(journal.entries)) {
    throw new Error("Unexpected Drizzle journal shape");
  }
  return journal.entries.length;
}

/** Copy of the package's migrations folder truncated after `lastTag`, i.e. an earlier release. */
function releasedMigrationsUpTo(lastTag: string): string {
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"));
  const last = journal.entries.findIndex((entry) => entry.tag === lastTag);
  if (last === -1) {
    throw new Error(`No migration tagged ${lastTag}`);
  }
  const entries = journal.entries.slice(0, last + 1);
  const folder = mkdtempSync(path.join(tmpdir(), "incision-release-"));
  folders.push(folder);
  mkdirSync(path.join(folder, "meta"));
  for (const entry of entries) {
    writeFileSync(path.join(folder, `${entry.tag}.sql`), readFileSync(path.join(MIGRATIONS_FOLDER, `${entry.tag}.sql`)));
  }
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify({ ...journal, entries }));
  return folder;
}

type FixtureMigration = { readonly sql: string; readonly when: number };

const folders: string[] = [];

afterEach(() => {
  folders.splice(0).forEach((folder) => rmSync(folder, { recursive: true, force: true }));
});

/** Writes a Drizzle migrations folder with the given SQL and timestamps, in journal order. */
function migrationsFolder(migrations: readonly (string | FixtureMigration)[]): string {
  const folder = mkdtempSync(path.join(tmpdir(), "incision-migrations-"));
  folders.push(folder);
  mkdirSync(path.join(folder, "meta"));
  const fixtures = migrations.map((migration, index) =>
    typeof migration === "string" ? { sql: migration, when: 1_000 + index } : migration,
  );
  const entries = fixtures.map((fixture, index) => ({ idx: index, version: "7", when: fixture.when, tag: `000${index}_fixture`, breakpoints: true }));
  fixtures.forEach((fixture, index) => writeFileSync(path.join(folder, `000${index}_fixture.sql`), fixture.sql));
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
  return folder;
}

describe("runMigrations", () => {
  it("builds the schema on an empty database, then a second run applies nothing", async () => {
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() });
    for (const table of ["accounts", "oauth_identities", "lobbies", "lobby_members"]) {
      expect(await tableExists(table)).toBe(true);
    }
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: 0 });
  });

  it("upgrades a database at the CP-03 release: existing accounts get session version 1", async () => {
    const cp03Release = releasedMigrationsUpTo("0000_init");
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: cp03Release })).toEqual({ applied: 1 });
    await query("insert into accounts (display_name) values ('Before CP-04')");
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() - 1 });
    const [row] = await query<{ session_version: number }>("select session_version from accounts");
    expect(row?.session_version).toBe(1);
    // Redeploying the CP-03 release on the upgraded database (rollback) applies nothing.
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: cp03Release })).toEqual({ applied: 0 });
  });

  it("serialises two concurrent migrators: a slow migration is applied exactly once", async () => {
    // Without the lock, both runs would read an empty journal and the second CREATE TABLE would fail.
    const slow = migrationsFolder(["select pg_sleep(1); create table slow (id integer primary key);"]);
    const results = await Promise.all([
      runMigrations({ connectionString: database.url, migrationsFolder: slow }),
      runMigrations({ connectionString: database.url, migrationsFolder: slow }),
    ]);
    expect(results.map((result) => result.applied).sort()).toEqual([0, 1]);
    const [journal] = await query<{ count: string }>("select count(*) as count from drizzle.__drizzle_migrations");
    expect(Number(journal?.count)).toBe(1);
  });

  it("applies nothing when one pending migration fails", async () => {
    const folder = migrationsFolder(["create table fixture_ok (id integer primary key);", "create table broken (;"]);
    await expect(runMigrations({ connectionString: database.url, migrationsFolder: folder })).rejects.toThrow();
    expect(await tableExists("fixture_ok")).toBe(false);
    const [journal] = await query<{ count: string }>("select count(*) as count from drizzle.__drizzle_migrations");
    expect(Number(journal?.count)).toBe(0);
  });

  it("fails when an applied migration was edited, before applying the release's new ones", async () => {
    await runMigrations({ connectionString: database.url, migrationsFolder: migrationsFolder(["create table a (id integer);"]) });
    const edited = migrationsFolder(["create table a (id integer); create table sneaky (id integer);", "create table newer (id integer);"]);
    await expect(runMigrations({ connectionString: database.url, migrationsFolder: edited })).rejects.toThrow(/differs from the applied one/);
    expect(await tableExists("sneaky")).toBe(false);
    expect(await tableExists("newer")).toBe(false);
  });

  it("fails when a new migration is dated before the last applied one, instead of skipping it", async () => {
    await runMigrations({ connectionString: database.url, migrationsFolder: migrationsFolder([{ sql: "create table a (id integer);", when: 2_000 }]) });
    const older = migrationsFolder([
      { sql: "create table a (id integer);", when: 2_000 },
      { sql: "create table late (id integer);", when: 1_500 },
      { sql: "create table newer (id integer);", when: 3_000 },
    ]);
    await expect(runMigrations({ connectionString: database.url, migrationsFolder: older })).rejects.toThrow(/was not applied/);
    expect(await tableExists("newer")).toBe(false);
  });

  it("applies the new migration of the next release on a database at the previous one", async () => {
    await runMigrations({ connectionString: database.url, migrationsFolder: migrationsFolder(["create table a (id integer);"]) });
    const nextRelease = migrationsFolder(["create table a (id integer);", "create table b (id integer);"]);
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: nextRelease })).toEqual({ applied: 1 });
    expect(await tableExists("b")).toBe(true);
    const [journal] = await query<{ count: string }>("select count(*) as count from drizzle.__drizzle_migrations");
    expect(Number(journal?.count)).toBe(2);
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: nextRelease })).toEqual({ applied: 0 });
  });

  it("fails before applying anything when the database has a migration the release replaced", async () => {
    await runMigrations({
      connectionString: database.url,
      migrationsFolder: migrationsFolder([
        { sql: "create table a (id integer);", when: 1_000 },
        { sql: "create table b (id integer);", when: 2_000 },
      ]),
    });
    const diverged = migrationsFolder([
      { sql: "create table a (id integer);", when: 1_000 },
      { sql: "create table c (id integer);", when: 3_000 },
    ]);
    await expect(runMigrations({ connectionString: database.url, migrationsFolder: diverged })).rejects.toThrow(/histories diverged/);
    expect(await tableExists("c")).toBe(false);
  });

  it("accepts a database that already has newer migrations, so an older release can be redeployed", async () => {
    await runMigrations({ connectionString: database.url, migrationsFolder: migrationsFolder(["create table a (id integer);", "create table b (id integer);"]) });
    const olderRelease = migrationsFolder(["create table a (id integer);"]);
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: olderRelease })).toEqual({ applied: 0 });
  });

  it("gives up after the lock wait when another migration holds the lock, and closes its connection", async () => {
    const holder = new pg.Client({ connectionString: database.url });
    await holder.connect();
    try {
      await holder.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
      await expect(runMigrations({ connectionString: database.url, lockWaitMs: 500 })).rejects.toThrow(/holds the lock/);
      const [sessions] = await query<{ count: string }>(
        "select count(*) as count from pg_stat_activity where application_name = 'incision-migrate' and datname = current_database()",
      );
      expect(Number(sessions?.count)).toBe(0);
    } finally {
      await holder.end();
    }
  });

  it("reads the package's own migrations folder, which the release archive includes", () => {
    expect(MIGRATIONS_FOLDER.endsWith(path.join("packages", "database", "drizzle"))).toBe(true);
    expect(existsSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"))).toBe(true);
  });
});
