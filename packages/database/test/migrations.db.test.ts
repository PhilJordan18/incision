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

/** The position of a migration in the package's journal. */
function journalIndex(tag: string): number {
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8"));
  const index = journal.entries.findIndex((entry) => entry.tag === tag);
  if (index === -1) throw new Error(`No migration tagged ${tag}`);
  return index;
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
  it("adds the 50-word default to populated settings without rewriting accounts, photos or historical races", async () => {
    const previous = releasedMigrationsUpTo("0011_race_bot_identities");
    await runMigrations({ connectionString: database.url, migrationsFolder: previous });
    await query("insert into accounts (display_name) values ('Preserved account')");
    await query("insert into profile_photos (account_id, webp) select id, decode('524946460000000057454250', 'hex') from accounts");
    const photosBefore = await query("select * from profile_photos");
    await query("insert into lobbies (code, capacity) values ('B7K4PQ', 30)");
    await query("insert into lobby_settings (lobby_id, revision, text_language, time_limit_ms, error_mode) select id, 7, 'en', 600000, 'free' from lobbies");
    await query(`insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at)
      select id, 1, 'finished', 1, 'Historical text.', '{"language":"en","timeLimitMs":600000,"errorMode":"free"}', now() - interval '3 minutes', now() - interval '2 minutes', now() - interval '1 minute', gen_random_uuid(), now() from lobbies`);
    const before = { accounts: await query("select * from accounts"), rooms: await query("select * from lobbies"), races: await query("select * from races") };
    const settingsBefore = await query("select lobby_id, revision, text_language, time_limit_ms, error_mode from lobby_settings");
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() - 12 });
    expect({ accounts: await query("select * from accounts"), rooms: await query("select * from lobbies"), races: await query("select * from races") }).toEqual(before);
    expect(await query("select lobby_id, revision, text_language, time_limit_ms, error_mode from lobby_settings")).toEqual(settingsBefore);
    expect(await query("select word_count from lobby_settings")).toEqual([{ word_count: 50 }]);
    expect(await query("select * from profile_photos")).toEqual(photosBefore);
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: previous })).toEqual({ applied: 0 });
  });
  it("gives populated settings D-19's text settings (0015) without touching their other values or historical races", async () => {
    // The migration before the text settings: whatever number the coordinator gives 0015, the test
    // upgrades from its predecessor and counts what is applied from the journal.
    const predecessor = "0014_anonymous_guest_results";
    const previous = releasedMigrationsUpTo(predecessor);
    await runMigrations({ connectionString: database.url, migrationsFolder: previous });
    await query("insert into lobbies (code, capacity) values ('C8M5RT', 12)");
    await query("insert into lobby_settings (lobby_id, revision, text_language, word_count, time_limit_ms, error_mode) select id, 4, 'en', 120, null, 'free' from lobbies");
    await query(`insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at)
      select id, 1, 'finished', 1, 'Historical text.', '{"language":"en","errorMode":"free"}', now() - interval '3 minutes', now() - interval '2 minutes', now() - interval '1 minute', gen_random_uuid(), now() from lobbies`);
    const before = { rooms: await query("select * from lobbies"), races: await query("select * from races"), settings: await query("select * from lobby_settings") };
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() - (journalIndex(predecessor) + 1) });
    expect({ rooms: await query("select * from lobbies"), races: await query("select * from races") }).toEqual({ rooms: before.rooms, races: before.races });
    expect(await query("select * from lobby_settings")).toEqual(before.settings.map((row) => ({
      ...row, text_kind: "coherent", complexity: "medium", punctuation: true, numbers: false, capitals: true, accents: true, include_characters: [], exclude_characters: [],
      // Later migrations add their own defaults (0016: training).
      bonuses_enabled: false,
    })));
    // Coherent mode cannot hold characters to include or exclude (D-10); random mode holds at most 100 of each.
    await expect(query("update lobby_settings set include_characters = '{a}'")).rejects.toThrow("lobby_settings_characters_random_only");
    await query("update lobby_settings set text_kind = 'random', include_characters = '{a}', exclude_characters = '{b}'");
    await expect(query("update lobby_settings set exclude_characters = array_fill('x'::text, array[101])")).rejects.toThrow("lobby_settings_characters_bounded");
    await expect(query("update lobby_settings set text_kind = 'coherent'")).rejects.toThrow("lobby_settings_characters_random_only");
  });

  it("keeps existing rooms in training (0016) without touching their text settings or historical races", async () => {
    // Upgrades from the text settings migration, whatever numbers the coordinator assigns.
    const predecessor = "0015_lobby_text_settings";
    await runMigrations({ connectionString: database.url, migrationsFolder: releasedMigrationsUpTo(predecessor) });
    await query("insert into lobbies (code, capacity) values ('D9N6SV', 8)");
    await query("insert into lobby_settings (lobby_id, revision, text_language, word_count, time_limit_ms, error_mode, text_kind, complexity) select id, 2, 'fr', 50, null, 'mandatory', 'random', 'hard' from lobbies");
    await query(`insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at)
      select id, 1, 'finished', 1, 'Texte.', '{"language":"fr","bonuses":false}', now() - interval '3 minutes', now() - interval '2 minutes', now() - interval '1 minute', gen_random_uuid(), now() from lobbies`);
    const before = { races: await query("select * from races"), settings: await query("select * from lobby_settings") };
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() - (journalIndex(predecessor) + 1) });
    expect(await query("select * from races")).toEqual(before.races);
    expect(await query("select * from lobby_settings")).toEqual(before.settings.map((row) => ({ ...row, bonuses_enabled: false })));
    await expect(query("update lobby_settings set bonuses_enabled = null")).rejects.toThrow();
  });

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

  it("upgrades a database at the first-race release (0003): the corpus tables arrive, rooms and races are untouched", async () => {
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: releasedMigrationsUpTo("0003_engine_error") })).toEqual({ applied: 4 });
    await query("insert into lobbies (code, capacity) values ('B7K4PQ', 30)");
    await query(
      `insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at)
       select id, 1, 'finished', 1, 'Texte.', '{"text": "fr-verne-vingt-mille-lieues-p1-ch14-pacifique"}', now() - interval '3 minutes', now() - interval '2 minutes', now() - interval '1 minute', gen_random_uuid(), now() from lobbies`,
    );
    const before = { lobbies: await query("select * from lobbies"), races: await query("select * from races") };
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() - 4 });
    for (const table of ["race_corpus_versions", "race_passages", "race_corpus_entries"]) {
      expect(await tableExists(table)).toBe(true);
    }
    expect({ lobbies: await query("select * from lobbies"), races: await query("select * from races") }).toEqual(before);
    // Redeploying the first-race release on the upgraded database (rollback) applies nothing.
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: releasedMigrationsUpTo("0003_engine_error") })).toEqual({ applied: 0 });
  });

  it("upgrades a database at the profile-photo release (0005): every room gets French texts, 120 s and mandatory correction (0006, 0007)", async () => {
    const photoRelease = releasedMigrationsUpTo("0005_profile_photos");
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: photoRelease })).toEqual({ applied: 6 });
    await query("insert into lobbies (code, capacity) values ('B7K4PQ', 30), ('C8M5RS', 2)");
    await query("update lobbies set phase = 'closed', closed_at = now() where code = 'C8M5RS'");
    const before = await query("select * from lobbies order by code");
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: releasedMigrationCount() - 6 });
    expect(await query("select l.code, s.revision, s.text_language, s.time_limit_ms, s.error_mode from lobby_settings s join lobbies l on l.id = s.lobby_id order by l.code")).toEqual([
      { code: "B7K4PQ", revision: 0, text_language: "fr", time_limit_ms: 120_000, error_mode: "mandatory" },
      { code: "C8M5RS", revision: 0, text_language: "fr", time_limit_ms: 120_000, error_mode: "mandatory" },
    ]);
    expect(await query("select * from lobbies order by code")).toEqual(before);
    // Redeploying the profile-photo release on the upgraded database (rollback) applies nothing.
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: photoRelease })).toEqual({ applied: 0 });
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
