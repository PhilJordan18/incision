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
 * Short, log-safe description of a database error: codes and messages only, never the
 * connection string. Node reports a refused IPv4 + IPv6 connection as an AggregateError
 * whose own message is empty.
 */
export function describeDatabaseError(error: unknown): string {
  return describe(error, 0);
}

/** Wrapped causes are followed this deep at most, so a cyclic `cause` cannot loop. */
const MAX_CAUSE_DEPTH = 5;

function describe(error: unknown, depth: number): string {
  if (depth > MAX_CAUSE_DEPTH) {
    return "nested error";
  }
  if (error instanceof AggregateError && error.errors.length > 0) {
    return error.errors.map((inner: unknown) => describe(inner, depth + 1)).join("; ");
  }
  // Drizzle wraps PostgreSQL errors in "Failed query: <sql> params: <values>": never print
  // the wrapper's message. With parameters, a PostgreSQL server message may quote one (a
  // cast, a RAISE, a tsquery...), so only its identifying fields are kept; client-side
  // causes (connection reset, timeout) never contain them and keep their message.
  // Other wrappers (e.g. pg-pool's connection timeout) keep their own, more precise message.
  if (isQueryWrapper(error)) {
    if (!(error.cause instanceof Error)) {
      return "query failed";
    }
    return hasParameters(error) && isServerError(error.cause)
      ? describeFields(error.cause)
      : describe(error.cause, depth + 1);
  }
  if (error instanceof Error) {
    const code = codeOf(error);
    // Data exceptions (class 22) quote the offending value, e.g. 22P02 for a malformed UUID.
    if (code.startsWith("22")) {
      return `${code} data exception`;
    }
    return `${code} ${error.message}`.trim() || error.name;
  }
  return "unknown error";
}

/** SQLSTATE and the names PostgreSQL reports (constraint, table, column), without the message. */
function describeFields(error: Error): string {
  const names: string[] = [];
  if ("constraint" in error && typeof error.constraint === "string") {
    names.push(`constraint ${error.constraint}`);
  }
  if ("table" in error && typeof error.table === "string") {
    names.push(`table ${error.table}`);
  }
  if ("column" in error && typeof error.column === "string") {
    names.push(`column ${error.column}`);
  }
  return [codeOf(error) || error.name, ...names].join(" ");
}

/** pg's DatabaseError, i.e. an error reported by the PostgreSQL server, carries a severity. */
function isServerError(error: Error): boolean {
  return "severity" in error && typeof error.severity === "string";
}

function codeOf(error: Error): string {
  return "code" in error && typeof error.code === "string" ? error.code : "";
}

function hasParameters(error: { readonly params: unknown }): boolean {
  return !Array.isArray(error.params) || error.params.length > 0;
}

/**
 * Judged by shape, not `instanceof DrizzleQueryError`: Next bundles its own copy of
 * drizzle-orm while the custom server loads node_modules, and both share one pool, so an
 * error may come from the other copy's class.
 */
function isQueryWrapper(error: unknown): error is Error & { readonly query: unknown; readonly params: unknown } {
  return error instanceof Error && "query" in error && "params" in error;
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
