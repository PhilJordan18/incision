import pg from "pg";

export type DatabaseCheck =
  | { readonly reachable: true }
  | { readonly reachable: false; readonly error: unknown };

/**
 * The client gives up on a query after this long. Transactions end their own waits on the
 * server before it (`SERVER_LIMITS_MS` in transaction.ts).
 */
export const QUERY_TIMEOUT_MS = 5_000;

const POOL_OPTIONS = {
  // Neon's free plan limits connections; the pooled URL multiplexes them further.
  max: 5,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  query_timeout: QUERY_TIMEOUT_MS,
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
  processGlobal.incisionDatabase ??= { connectionString, pool: createDatabasePool(connectionString) };
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

type ConnectCallback = Parameters<pg.Pool["connect"]>[0];

/**
 * A pool that never hands out a connection still inside a transaction, and whose clients
 * never crash the process with an error.
 *
 * - Drizzle releases a transaction's client without an error even when its rollback timed
 *   out (a statement blocked for more than twice the client timeout, or a network stall).
 *   That client is still inside its transaction on the server: reused, the next borrower
 *   would run in it, and commit it. A client released while its transaction is open or
 *   failed (`getTransactionStatus()` other than idle) is destroyed instead; closing its
 *   connection ends the session, so the server rolls the transaction back.
 * - pg-pool listens to a client's errors only while it is idle in the pool. When the server
 *   ends the session of a checked-out client that is not running a query (a termination,
 *   an idle-transaction limit, a Neon restart), the client emits an `error` that nobody
 *   would handle, and Node would exit. Every client keeps a listener for its whole life:
 *   the client is then only unusable, and the pool discards it when it is released.
 */
class GuardedPool extends pg.Pool {
  constructor(config: pg.PoolConfig) {
    super(config);
    this.on("connect", (client) => {
      client.on("error", (error) => {
        console.error("[database] client error:", describeDatabaseError(error));
      });
    });
    // Already logged by the client's own listener; without this one, pg-pool's report of
    // an error on an idle client would itself crash the process.
    this.on("error", () => undefined);
  }

  override connect(): Promise<pg.PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<pg.PoolClient> | undefined {
    // pool.query() uses the callback form and already releases a failed client with its
    // error; transactions use the promise form.
    if (callback !== undefined) {
      super.connect(callback);
      return undefined;
    }
    return super.connect().then(guardRelease);
  }
}

function guardRelease(client: pg.PoolClient): pg.PoolClient {
  const release = client.release.bind(client);
  client.release = (error?: Error | boolean) => {
    if (error === undefined || error === false) {
      if (client.getTransactionStatus() !== "I") {
        console.error("[database] client released inside a transaction: discarded");
        release(new Error("Released inside a transaction"));
        return;
      }
    }
    release(error);
  };
  return client;
}

/** The application's pool; tests may shorten its timeout or size. */
export function createDatabasePool(connectionString: string, overrides: { readonly max?: number; readonly queryTimeoutMs?: number } = {}): pg.Pool {
  return new GuardedPool({
    connectionString,
    ...POOL_OPTIONS,
    ...(overrides.max === undefined ? {} : { max: overrides.max }),
    ...(overrides.queryTimeoutMs === undefined ? {} : { query_timeout: overrides.queryTimeoutMs }),
  });
}
