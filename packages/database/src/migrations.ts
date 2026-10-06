import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { drizzle } from "drizzle-orm/node-postgres";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

// Not re-exported by the package index, so the web app never bundles the migrator.
export const MIGRATIONS_FOLDER = path.join(import.meta.dirname, "..", "drizzle");

/** Advisory lock shared by every Incision migrator: one migration run at a time per database. */
export const MIGRATION_LOCK_KEY = 1_646_910_403;

export type MigrationOptions = {
  /** Direct (unpooled) URL: session advisory locks do not survive a transaction pooler. */
  readonly connectionString: string;
  readonly migrationsFolder?: string;
  readonly lockWaitMs?: number;
  readonly statementTimeoutMs?: number;
  readonly lockTimeoutMs?: number;
};

/**
 * Applies pending migrations on one dedicated connection. The advisory lock is held from
 * before Drizzle reads its journal until it has committed; Drizzle applies all pending
 * migrations in a single transaction, so a failure leaves none of them applied.
 */
export async function runMigrations(options: MigrationOptions): Promise<{ readonly applied: number }> {
  const client = new pg.Client({
    connectionString: options.connectionString,
    connectionTimeoutMillis: 10_000,
    statement_timeout: options.statementTimeoutMs ?? 120_000,
    // DDL waiting behind application queries fails fast instead of queueing them.
    lock_timeout: options.lockTimeoutMs ?? 10_000,
    application_name: "incision-migrate",
  });
  await client.connect();
  try {
    await acquireMigrationLock(client, options.lockWaitMs ?? 60_000);
    try {
      const migrationsFolder = options.migrationsFolder ?? MIGRATIONS_FOLDER;
      const before = await countAppliedMigrations(client);
      // Before: an edited or back-dated migration fails with nothing applied.
      await assertJournalMatches(client, migrationsFolder, "applied-only");
      await migrate(drizzle({ client }), { migrationsFolder });
      // After: every migration of the release is now recorded with its hash.
      await assertJournalMatches(client, migrationsFolder, "all");
      return { applied: (await countAppliedMigrations(client)) - before };
    } finally {
      await client.query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => undefined);
    }
  } finally {
    // Closing the session also releases the lock if the unlock above could not run.
    await client.end();
  }
}

async function acquireMigrationLock(client: pg.Client, waitMs: number): Promise<void> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const result = await client.query<{ locked: boolean }>("select pg_try_advisory_lock($1) as locked", [MIGRATION_LOCK_KEY]);
    if (result.rows[0]?.locked === true) {
      return;
    }
    if (Date.now() >= deadline) {
      throw new Error(`Another migration holds the lock; gave up after ${waitMs} ms`);
    }
    await delay(250);
  }
}

/**
 * Drizzle neither checks recorded hashes nor applies a migration dated before the last
 * applied one: both would silently skip SQL. Local migrations must therefore be recorded
 * with the same hash: before migrating, those dated up to the last recorded one; after,
 * all of them. Extra recorded migrations are allowed, so redeploying an older release
 * (rollback) still works.
 */
async function assertJournalMatches(
  client: pg.Client,
  migrationsFolder: string,
  scope: "applied-only" | "all",
): Promise<void> {
  if (scope === "applied-only" && (await countAppliedMigrations(client)) === 0) {
    return;
  }
  const recorded = await client.query<{ hash: string; created_at: string }>(
    "select hash, created_at from drizzle.__drizzle_migrations",
  );
  const recordedHashes = new Map(recorded.rows.map((row) => [Number(row.created_at), row.hash]));
  const lastRecorded = Math.max(...recordedHashes.keys());
  for (const migration of readMigrationFiles({ migrationsFolder })) {
    if (scope === "applied-only" && migration.folderMillis > lastRecorded) {
      continue;
    }
    const hash = recordedHashes.get(migration.folderMillis);
    if (hash === undefined) {
      throw new Error(`Migration dated ${migration.folderMillis} was not applied (dated before the last applied one?)`);
    }
    if (hash !== migration.hash) {
      throw new Error(`Migration dated ${migration.folderMillis} differs from the applied one: never edit an applied migration`);
    }
  }
}

async function countAppliedMigrations(client: pg.Client): Promise<number> {
  const table = await client.query<{ exists: boolean }>(
    "select to_regclass('drizzle.__drizzle_migrations') is not null as exists",
  );
  if (table.rows[0]?.exists !== true) {
    return 0;
  }
  const count = await client.query<{ count: string }>("select count(*) as count from drizzle.__drizzle_migrations");
  return Number(count.rows[0]?.count ?? 0);
}
