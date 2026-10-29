import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { guestSessions } from "../schema/guest-sessions";
import { boundedTransaction, READ_COMMITTED } from "../transaction";

export type GuestSessionProof = { readonly id: string; readonly secretDigest: string };
export type GuestSessionRow = { readonly id: string; readonly expiresAt: Date };
export type GuestSessionRead =
  | { readonly kind: "valid"; readonly session: GuestSessionRow }
  | { readonly kind: "invalid" | "expired" };

export async function createGuestSession(db: Database, proof: GuestSessionProof): Promise<GuestSessionRow> {
  return boundedTransaction(db, async (tx) => {
    const [row] = await tx.insert(guestSessions).values({
      ...proof,
      createdAt: sql`statement_timestamp()`,
      lastSeenAt: sql`statement_timestamp()`,
      expiresAt: sql`statement_timestamp() + interval '24 hours'`,
    }).returning({ id: guestSessions.id, expiresAt: guestSessions.expiresAt });
    if (row === undefined) throw new Error("Guest session insert failed");
    return row;
  }, READ_COMMITTED);
}

/** Read-only status: never extends a deadline. A mismatched proof reveals no session state. */
export async function readGuestSession(db: Database, proof: GuestSessionProof): Promise<GuestSessionRead> {
  const [row] = await db.select({ id: guestSessions.id, expiresAt: guestSessions.expiresAt,
    active: gt(guestSessions.expiresAt, sql`statement_timestamp()`),
  }).from(guestSessions).where(and(eq(guestSessions.id, proof.id), eq(guestSessions.secretDigest, proof.secretDigest)));
  if (row === undefined) return { kind: "invalid" };
  return row.active ? { kind: "valid", session: { id: row.id, expiresAt: row.expiresAt } } : { kind: "expired" };
}

/**
 * Lock before sampling the DB clock: a request delayed on another renewal must not use
 * its old statement start to resurrect an expired session or shorten a newer deadline.
 */
export async function touchGuestSession(db: Database, proof: GuestSessionProof): Promise<GuestSessionRead> {
  return boundedTransaction(db, async (tx) => {
    const [locked] = await tx.select({ id: guestSessions.id }).from(guestSessions)
      .where(and(eq(guestSessions.id, proof.id), eq(guestSessions.secretDigest, proof.secretDigest))).for("update");
    if (locked === undefined) return { kind: "invalid" };
    const [row] = await tx.update(guestSessions).set({
      lastSeenAt: sql`greatest(${guestSessions.lastSeenAt}, statement_timestamp())`,
      expiresAt: sql`greatest(${guestSessions.lastSeenAt}, statement_timestamp()) + interval '24 hours'`,
    }).where(and(eq(guestSessions.id, proof.id), gt(guestSessions.expiresAt, sql`statement_timestamp()`)))
      .returning({ id: guestSessions.id, expiresAt: guestSessions.expiresAt });
    return row === undefined ? { kind: "expired" } : { kind: "valid", session: row };
  }, READ_COMMITTED);
}

/**
 * Bounded cleanup for unreferenced expired identities only, not a room/history purge.
 * No scheduler invokes this yet. The RESTRICT FK also guards concurrent references.
 */
export async function purgeUnusedGuestSessions(db: Database): Promise<number> {
  return boundedTransaction(db, async (tx) => {
    const result = await tx.execute(sql`
      with expired as (
        select g.id from guest_sessions g
        where g.expires_at <= statement_timestamp()
          and not exists (select 1 from lobby_members m where m.guest_session_id = g.id)
        order by g.expires_at, g.id limit 100 for update of g skip locked
      )
      delete from guest_sessions g using expired e where g.id = e.id returning g.id`);
    return result.rowCount ?? 0;
  }, READ_COMMITTED);
}
