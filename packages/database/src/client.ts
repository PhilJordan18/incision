import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { getDatabasePool } from "./pool";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(client: pg.Pool | pg.Client): Database {
  return drizzle({ client, schema });
}

/**
 * One Drizzle instance per copy of this module, over the process-wide pool. Only the pool
 * is shared through globalThis: Next bundles its own copy of drizzle-orm, and an instance
 * from another copy would throw that copy's error classes into this one's code.
 */
const databases = new WeakMap<pg.Pool, Database>();

/** Drizzle over the process-wide pool (pooled Neon URL in production). */
export function getDatabase(connectionString: string): Database {
  const pool = getDatabasePool(connectionString);
  let database = databases.get(pool);
  if (database === undefined) {
    database = createDatabase(pool);
    databases.set(pool, database);
  }
  return database;
}
