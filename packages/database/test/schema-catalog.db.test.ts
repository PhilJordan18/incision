import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

type Named = Record<string, unknown>;
type SnapshotTable = {
  readonly name: string;
  readonly indexes: Named;
  readonly foreignKeys: Named;
  readonly uniqueConstraints: Named;
  readonly checkConstraints: Named;
};
type Snapshot = {
  readonly tables: Record<string, SnapshotTable>;
  readonly enums: Record<string, { readonly name: string; readonly values: readonly string[] }>;
};

/** The snapshot Drizzle Kit wrote with the last migration: what the SQL is supposed to create. */
function latestSnapshot(): Snapshot {
  const journal = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta", "_journal.json"), "utf8")) as {
    entries: { idx: number }[];
  };
  const last = Math.max(...journal.entries.map((entry) => entry.idx));
  const file = path.join(MIGRATIONS_FOLDER, "meta", `${String(last).padStart(4, "0")}_snapshot.json`);
  return JSON.parse(readFileSync(file, "utf8")) as Snapshot;
}

let database: TemporaryDatabase;
let client: pg.Client;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  client = new pg.Client({ connectionString: database.url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await database.drop();
});

// The CI drift check compares the schema with the snapshot, not with the SQL: this test
// catches a migration edited by hand that no longer creates what the snapshot describes.
describe("migrated catalog", () => {
  it("contains every constraint and index of the Drizzle snapshot, on the right table", async () => {
    const constraints = await client.query<{ table_name: string; name: string }>(
      "select conrelid::regclass::text as table_name, conname as name from pg_constraint where connamespace = 'public'::regnamespace",
    );
    const indexes = await client.query<{ table_name: string; name: string }>(
      "select tablename as table_name, indexname as name from pg_indexes where schemaname = 'public'",
    );
    const actual = new Set([...constraints.rows, ...indexes.rows].map((row) => `${row.table_name}.${row.name}`));

    const expected = Object.values(latestSnapshot().tables).flatMap((table) =>
      [table.indexes, table.foreignKeys, table.uniqueConstraints, table.checkConstraints].flatMap((group) =>
        Object.keys(group).map((name) => `${table.name}.${name}`),
      ),
    );
    expect(expected.length).toBeGreaterThan(0);
    expect(expected.filter((name) => !actual.has(name))).toEqual([]);
  });

  it("creates every enum of the snapshot with the same values, in order", async () => {
    const enums = await client.query<{ name: string; values: string[] }>(
      "select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as values from pg_type t join pg_enum e on e.enumtypid = t.oid group by t.typname",
    );
    const actual = Object.fromEntries(enums.rows.map((row) => [row.name, row.values]));
    for (const { name, values } of Object.values(latestSnapshot().enums)) {
      expect(actual[name]).toEqual(values);
    }
  });
});
