import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "../src/migrations";
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

/** Writes a Drizzle migrations folder with the given SQL files, in order. */
function migrationsFolder(files: readonly string[]): string {
  const folder = mkdtempSync(path.join(tmpdir(), "incision-migrations-"));
  mkdirSync(path.join(folder, "meta"));
  const entries = files.map((_, index) => ({ idx: index, version: "7", when: 1_000 + index, tag: `000${index}_fixture`, breakpoints: true }));
  files.forEach((sql, index) => writeFileSync(path.join(folder, `000${index}_fixture.sql`), sql));
  writeFileSync(path.join(folder, "meta", "_journal.json"), JSON.stringify({ version: "7", dialect: "postgresql", entries }));
  return folder;
}

describe("runMigrations", () => {
  it("builds the schema on an empty database, then a second run applies nothing", async () => {
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: 1 });
    for (const table of ["accounts", "oauth_identities", "lobbies", "lobby_members"]) {
      expect(await tableExists(table)).toBe(true);
    }
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: 0 });
  });

  it("serialises two concurrent migrators: the migration is applied exactly once", async () => {
    const results = await Promise.all([
      runMigrations({ connectionString: database.url }),
      runMigrations({ connectionString: database.url }),
    ]);
    expect(results.map((result) => result.applied).sort()).toEqual([0, 1]);
    const [journal] = await query<{ count: string }>("select count(*) as count from drizzle.__drizzle_migrations");
    expect(Number(journal?.count)).toBe(1);
  });

  it("applies nothing when one pending migration fails", async () => {
    const folder = migrationsFolder(["create table fixture_ok (id integer primary key);", "create table broken (;"]);
    try {
      await expect(runMigrations({ connectionString: database.url, migrationsFolder: folder })).rejects.toThrow();
      expect(await tableExists("fixture_ok")).toBe(false);
      const [journal] = await query<{ count: string }>("select count(*) as count from drizzle.__drizzle_migrations");
      expect(Number(journal?.count)).toBe(0);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });

  it("gives up after the lock wait when another migration holds the lock, and closes its connection", async () => {
    const holder = new pg.Client({ connectionString: database.url });
    await holder.connect();
    try {
      await holder.query("select pg_advisory_lock(1646910403)");
      await expect(runMigrations({ connectionString: database.url, lockWaitMs: 500 })).rejects.toThrow(/holds the lock/);
      const [sessions] = await query<{ count: string }>(
        "select count(*) as count from pg_stat_activity where application_name = 'incision-migrate'",
      );
      expect(Number(sessions?.count)).toBe(0);
    } finally {
      await holder.end();
    }
  });

  it("ships its SQL in the package folder used by the release", () => {
    expect(MIGRATIONS_FOLDER.endsWith(path.join("packages", "database", "drizzle"))).toBe(true);
  });
});
