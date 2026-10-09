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

/**
 * Applies `SERVER_LIMITS_MS` to the current transaction only, in one statement:
 * `set_config(…, true)` is `SET LOCAL`, the only kind Neon's transaction pooling allows.
 */
export async function limitServerWaits(tx: Transaction): Promise<void> {
  await tx.execute(
    sql`select set_config('lock_timeout', ${`${SERVER_LIMITS_MS.lock}ms`}, true),
      set_config('statement_timeout', ${`${SERVER_LIMITS_MS.statement}ms`}, true),
      set_config('idle_in_transaction_session_timeout', ${`${SERVER_LIMITS_MS.idleInTransaction}ms`}, true)`,
  );
}
