import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MIGRATIONS_FOLDER, runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

type Named = Record<string, unknown>;
type SnapshotColumn = { readonly name: string; readonly type: string; readonly notNull: boolean };
type SnapshotIndex = { readonly name: string; readonly isUnique: boolean; readonly where?: string };
type SnapshotForeignKey = { readonly name: string; readonly onDelete?: string; readonly onUpdate?: string };
type SnapshotTable = {
  readonly name: string;
  readonly columns: Record<string, SnapshotColumn>;
  readonly indexes: Record<string, SnapshotIndex>;
  readonly foreignKeys: Record<string, SnapshotForeignKey>;
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

/** pg_constraint's single-letter referential actions, as Drizzle names them. */
const REFERENTIAL_ACTIONS: Record<string, string> = {
  a: "no action",
  r: "restrict",
  c: "cascade",
  n: "set null",
  d: "set default",
};

// The CI drift check compares the schema with the snapshot, not with the SQL: this test
// catches a migration edited by hand that no longer creates what the snapshot describes.
// It compares names, tables, column types and nullability, index uniqueness and partial
// predicates, and foreign-key actions; check expressions are covered by behaviour tests.
describe("migrated catalog", () => {
  it("has exactly the snapshot's tables, with the same column types and nullability", async () => {
    const columns = await client.query<{ table_name: string; name: string; type: string; not_null: boolean }>(
      `select c.relname as table_name, a.attname as name, format_type(a.atttypid, a.atttypmod) as type, a.attnotnull as not_null
       from pg_attribute a join pg_class c on c.oid = a.attrelid
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped`,
    );
    const actual = new Map<string, Record<string, { type: string; notNull: boolean }>>();
    for (const row of columns.rows) {
      actual.set(row.table_name, { ...actual.get(row.table_name), [row.name]: { type: row.type, notNull: row.not_null } });
    }
    const tables = Object.values(latestSnapshot().tables);
    expect([...actual.keys()].sort()).toEqual(tables.map((table) => table.name).sort());
    for (const table of tables) {
      const expected = Object.fromEntries(
        Object.values(table.columns).map((column) => [column.name, { type: column.type, notNull: column.notNull }]),
      );
      expect({ table: table.name, columns: actual.get(table.name) }).toEqual({ table: table.name, columns: expected });
    }
  });

  it("creates indexes with the snapshot's uniqueness and partial predicate", async () => {
    const indexes = await client.query<{ name: string; is_unique: boolean; is_partial: boolean }>(
      `select c.relname as name, i.indisunique as is_unique, i.indpred is not null as is_partial
       from pg_index i join pg_class c on c.oid = i.indexrelid
       where c.relnamespace = 'public'::regnamespace`,
    );
    const actual = new Map(indexes.rows.map((row) => [row.name, { isUnique: row.is_unique, isPartial: row.is_partial }]));
    for (const table of Object.values(latestSnapshot().tables)) {
      for (const index of Object.values(table.indexes)) {
        expect({ index: index.name, ...actual.get(index.name) }).toEqual({
          index: index.name,
          isUnique: index.isUnique,
          isPartial: index.where !== undefined,
        });
      }
    }
  });

  it("creates foreign keys with the snapshot's delete and update actions", async () => {
    const keys = await client.query<{ name: string; on_delete: string; on_update: string }>(
      "select conname as name, confdeltype as on_delete, confupdtype as on_update from pg_constraint where contype = 'f' and connamespace = 'public'::regnamespace",
    );
    const actual = new Map(keys.rows.map((row) => [row.name, row]));
    for (const table of Object.values(latestSnapshot().tables)) {
      for (const key of Object.values(table.foreignKeys)) {
        const row = actual.get(key.name);
        expect({
          key: key.name,
          onDelete: row && REFERENTIAL_ACTIONS[row.on_delete],
          onUpdate: row && REFERENTIAL_ACTIONS[row.on_update],
        }).toEqual({ key: key.name, onDelete: key.onDelete ?? "no action", onUpdate: key.onUpdate ?? "no action" });
      }
    }
  });

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
