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

// The callback overload is pg's last one, the one `Parameters` reads.
type ConnectCallback = Parameters<pg.Pool["connect"]>[0];

/** A client checked out longer than this is reclaimed: every transaction ends well before. */
export const CHECKOUT_LIMIT_MS = 30_000;

/** Smaller pools and shorter limits, for the tests and the check script. */
type PoolOverrides = { readonly max?: number; readonly queryTimeoutMs?: number; readonly checkoutLimitMs?: number };

/**
 * The application's pool: a plain `pg.Pool` (Drizzle recognises it in every bundled copy of
 * pg, by class or by name), whose clients never carry an unfinished transaction to the next
 * borrower and never crash the process.
 *
 * - Drizzle releases a transaction's client without an error even when its rollback timed
 *   out, and never releases it when BEGIN itself fails. Each checkout is therefore guarded
 *   (`guardCheckout`): the client is destroyed, instead of reused, on its first client-side
 *   failure, on its own error, when released inside a transaction or with a query in flight,
 *   or when held too long. Closing the connection ends the session, and the server rolls the
 *   transaction back once its current statement ends.
 * - pg-pool listens to a client's errors only while it is idle in the pool. When the server
 *   ends the session of a checked-out client that runs no query (a termination, an idle
 *   transaction limit, a Neon restart), nobody would handle the client's `error`, and Node
 *   would exit. Every client keeps a listener for its whole life.
 */
export function createDatabasePool(connectionString: string, overrides: PoolOverrides = {}): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    ...POOL_OPTIONS,
    max: overrides.max ?? POOL_OPTIONS.max,
    query_timeout: overrides.queryTimeoutMs ?? QUERY_TIMEOUT_MS,
  });
  const checkoutLimitMs = overrides.checkoutLimitMs ?? CHECKOUT_LIMIT_MS;
  pool.on("connect", (client) => {
    client.on("error", (error) => {
      console.error("[database] client error:", describeDatabaseError(error));
    });
  });
  // Already logged by the client's own listener; without this one, pg-pool's report of an
  // error on an idle client would itself crash the process.
  pool.on("error", () => undefined);
  const acquire = pool.connect.bind(pool);
  function connect(): Promise<pg.PoolClient>;
  function connect(callback: ConnectCallback): void;
  function connect(callback?: ConnectCallback): Promise<pg.PoolClient> | undefined {
    if (callback === undefined) {
      return acquire().then((client) => guardCheckout(client, checkoutLimitMs));
    }
    // pool.query() takes this path: its client is guarded too.
    acquire((error, client, done) => {
      const guarded = client === undefined ? undefined : guardCheckout(client, checkoutLimitMs);
      callback(error, guarded, guarded === undefined ? done : guarded.release);
    });
    return undefined;
  }
  pool.connect = connect;
  return pool;
}

/** pg's DatabaseError: the server answered, so the connection is still in step with it. */
function answeredByServer(error: unknown): boolean {
  return error instanceof Error && "severity" in error && typeof error.severity === "string";
}

/**
 * Releases the client exactly once: reused only when idle, outside any transaction, with no
 * query in flight; destroyed otherwise. A query that fails on the client (a timeout, a broken
 * connection) leaves the connection out of step with the server, so the client is destroyed
 * at once, which also frees its slot when Drizzle never releases it (a failed BEGIN).
 */
function guardCheckout(client: pg.PoolClient, checkoutLimitMs: number): pg.PoolClient {
  const release = client.release;
  const query = client.query;
  let inFlight = 0;
  let released = false;
  const finish = (error?: Error | boolean, reason?: string): void => {
    if (released) {
      return;
    }
    released = true;
    clearTimeout(watchdog);
    client.removeListener("error", onError);
    Reflect.deleteProperty(client, "query");
    const unsafe = error === undefined || error === false ? unsafeToReuse() : undefined;
    const discard = reason ?? unsafe;
    if (discard !== undefined) {
      console.error(`[database] client discarded: ${discard}`);
    }
    release(error === undefined || error === false ? (unsafe === undefined ? undefined : new Error(unsafe)) : error);
  };
  const unsafeToReuse = (): string | undefined => {
    if (inFlight > 0) {
      return "released with a query in flight";
    }
    return client.getTransactionStatus() === "I" ? undefined : "released inside a transaction";
  };
  const failedOnClient = (error: unknown) => {
    if (!answeredByServer(error)) {
      finish(error instanceof Error ? error : new Error("Query failed"), `query failed on the client (${describeDatabaseError(error)})`);
    }
  };
  const watchdog = setTimeout(() => finish(new Error("Held too long"), `held longer than ${checkoutLimitMs} ms`), checkoutLimitMs);
  watchdog.unref();
  // Logged by the client's permanent listener.
  const onError = (error: Error) => finish(error);
  client.on("error", onError);
  // Counts the queries in flight and catches client-side failures, for both calling styles.
  const guardedQuery = (...args: unknown[]): unknown => {
    inFlight += 1;
    const last = args.at(-1);
    if (typeof last === "function") {
      args[args.length - 1] = (error: unknown, result: unknown) => {
        inFlight -= 1;
        if (error) {
          failedOnClient(error);
        }
        Reflect.apply(last, undefined, [error, result]);
      };
      return Reflect.apply(query, client, args);
    }
    const result: unknown = Reflect.apply(query, client, args);
    if (result instanceof Promise) {
      result.then(
        () => {
          inFlight -= 1;
        },
        (error: unknown) => {
          inFlight -= 1;
          failedOnClient(error);
        },
      );
    } else {
      inFlight -= 1;
    }
    return result;
  };
  // pg's query is heavily overloaded; the wrapper forwards every form unchanged.
  client.query = guardedQuery as pg.PoolClient["query"];
  client.release = finish;
  return client;
}
