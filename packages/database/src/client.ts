import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import type pg from "pg";
import { getDatabasePool } from "./pool";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export function createDatabase(client: pg.Pool | pg.Client): Database {
  return drizzle({ client, schema });
}

/** Drizzle over the process-wide pool (pooled Neon URL in production). */
export function getDatabase(connectionString: string): Database {
  return createDatabase(getDatabasePool(connectionString));
}
