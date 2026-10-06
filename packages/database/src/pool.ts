import pg from "pg";

export type DatabaseCheck =
  | { readonly reachable: true }
  | { readonly reachable: false; readonly error: unknown };

const POOL_OPTIONS = {
  // Neon's free plan limits connections; the pooled URL multiplexes them further.
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  query_timeout: 5_000,
} as const;

// Next bundles route handlers separately from the custom server, so a module-level
// variable would give each bundle its own pool. One pool per process instead.
const processGlobal = globalThis as typeof globalThis & {
  incisionDatabase?: { readonly connectionString: string; readonly pool: pg.Pool };
};

/**
 * Process-wide pool for the application, created on first use. The app uses the
 * pooled Neon URL (`DATABASE_URL`); migrations use `DATABASE_URL_UNPOOLED`.
 * A process talks to one database: another connection string is a programming error.
 */
export function getDatabasePool(connectionString: string): pg.Pool {
  processGlobal.incisionDatabase ??= { connectionString, pool: createPool(connectionString) };
  if (processGlobal.incisionDatabase.connectionString !== connectionString) {
    throw new Error("The database pool already exists for another connection string");
  }
  return processGlobal.incisionDatabase.pool;
}

export async function checkDatabaseConnection(pool: pg.Pool): Promise<DatabaseCheck> {
  try {
    await pool.query("SELECT 1");
    return { reachable: true };
  } catch (error: unknown) {
    return { reachable: false, error };
  }
}

/**
 * Short, log-safe description of a connection error: codes and messages only, never
 * the connection string. Node reports a refused IPv4 + IPv6 connection as an
 * AggregateError whose own message is empty.
 */
export function describeDatabaseError(error: unknown): string {
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map(describeDatabaseError).join("; ");
  }
  // Drizzle wraps PostgreSQL errors in "Failed query: <sql> params: <values>": describe the
  // PostgreSQL cause (code and reason) instead, which also keeps parameter values out of logs.
  if (error instanceof Error && error.cause !== undefined) {
    return describeDatabaseError(error.cause);
  }
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? `${error.code} ` : "";
    return `${code}${error.message}`.trim() || error.name;
  }
  return "unknown error";
}

function createPool(connectionString: string): pg.Pool {
  const pool = new pg.Pool({ connectionString, ...POOL_OPTIONS });
  // Neon closes idle connections when its compute suspends. Without a listener,
  // that error on an idle client would crash the whole process.
  pool.on("error", (error) => {
    console.error("[database] idle client error:", describeDatabaseError(error));
  });
  return pool;
}
