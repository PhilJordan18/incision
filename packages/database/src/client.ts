import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { getDatabasePool } from "./pool";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(client: pg.Pool | pg.Client): Database {
  return drizzle({ client, schema });
}

const processGlobal = globalThis as typeof globalThis & { incisionDrizzle?: { pool: pg.Pool; db: Database } };

/** Drizzle over the process-wide pool (pooled Neon URL in production), created once. */
export function getDatabase(connectionString: string): Database {
  const pool = getDatabasePool(connectionString);
  if (processGlobal.incisionDrizzle?.pool !== pool) {
    processGlobal.incisionDrizzle = { pool, db: createDatabase(pool) };
  }
  return processGlobal.incisionDrizzle.db;
}
