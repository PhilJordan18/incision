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
 * Server-side limits of a race transaction, each below the pool's client timeout
 * (`QUERY_TIMEOUT_MS`). A lock wait or a slow statement then ends with an error from
 * PostgreSQL, and the transaction rolls back cleanly. A client timeout would instead abandon
 * it: its rollback could time out too, and the connection would go back to the pool with the
 * transaction still open and its locks held. A stalled network can still cause that; only the
 * pool can guard against it.
 */
export const SERVER_LIMITS_MS = { lock: 2_000, statement: 3_000 } as const;

/** Applies `SERVER_LIMITS_MS` to the current transaction only (one statement). */
export async function limitServerWaits(tx: Transaction): Promise<void> {
  await tx.execute(
    sql`select set_config('lock_timeout', ${`${SERVER_LIMITS_MS.lock}ms`}, true), set_config('statement_timeout', ${`${SERVER_LIMITS_MS.statement}ms`}, true)`,
  );
}
