import { sql } from "drizzle-orm";
import type { Database } from "./client";

export type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
export type Queryable = Database | Transaction;

/**
 * The room and race rules rely on READ COMMITTED: after the room lock, each statement sees
 * every commit made before it (counts, taken names, memberships, the latest race row).
 */
export const READ_COMMITTED = { isolationLevel: "read committed" } as const;

/**
 * Server-side limits of a transaction, each below the pool's client timeout
 * (`QUERY_TIMEOUT_MS`). A lock wait or a slow statement ends with an error from PostgreSQL,
 * and the transaction rolls back cleanly instead of being abandoned by a client timeout. A
 * transaction left idle, its client gone silent (a network stall), is ended by the server,
 * which releases its locks; the pool's clients handle that error without crashing.
 */
export const SERVER_LIMITS_MS = { lock: 2_000, statement: 3_000, idleInTransaction: 4_000 } as const;

export type ServerLimits = { readonly lock: number; readonly statement: number; readonly idleInTransaction: number };

/**
 * Applies `SERVER_LIMITS_MS` to the current transaction only, in one statement:
 * `set_config(…, true)` is `SET LOCAL`, the only kind of setting that is safe under Neon's
 * transaction pooling. A limited transaction must await nothing but the database: 4 s spent
 * elsewhere end its session.
 */
async function limitServerWaits(tx: Transaction, limits: ServerLimits): Promise<void> {
  await tx.execute(
    sql`select set_config('lock_timeout', ${`${limits.lock}ms`}, true),
      set_config('statement_timeout', ${`${limits.statement}ms`}, true),
      set_config('idle_in_transaction_session_timeout', ${`${limits.idleInTransaction}ms`}, true)`,
  );
}

/**
 * A transaction that applies `SERVER_LIMITS_MS` before anything else, so no transaction of the
 * application can forget them. An operator's batch (the corpus import) may pass longer limits.
 */
export async function boundedTransaction<Result>(
  db: Database,
  work: (tx: Transaction) => Promise<Result>,
  config?: Parameters<Database["transaction"]>[1],
  limits: ServerLimits = SERVER_LIMITS_MS,
): Promise<Result> {
  return db.transaction(async (tx) => {
    await limitServerWaits(tx, limits);
    return work(tx);
  }, config);
}
