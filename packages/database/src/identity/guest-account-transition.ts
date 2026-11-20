import { and, eq, gt, sql } from "drizzle-orm";
import type { Database } from "../client";
import { guestSessions, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import type { GuestSessionProof } from "./guest-sessions";

/**
 * Final login fence, after credentials/provider authentication. Serialize with admission
 * on the guest row. An unused identity is retired so admission cannot win after login's
 * check; a referenced identity requires explicit departure. Never copies any results.
 */
export async function prepareGuestAccountSignIn(db: Database, proof: GuestSessionProof): Promise<boolean> {
  return boundedTransaction(db, async (tx) => {
    const [locked] = await tx.select({ id: guestSessions.id }).from(guestSessions)
      .where(and(eq(guestSessions.id, proof.id), eq(guestSessions.secretDigest, proof.secretDigest))).for("update");
    if (locked === undefined) return true;
    const [live] = await tx.select({ id: guestSessions.id }).from(guestSessions)
      .where(and(eq(guestSessions.id, proof.id), gt(guestSessions.expiresAt, sql`statement_timestamp()`)));
    if (live === undefined) return true; // Expired identities cannot regain admission.
    const [member] = await tx.select({ id: lobbyMembers.id }).from(lobbyMembers)
      .where(eq(lobbyMembers.guestSessionId, proof.id)).limit(1);
    if (member !== undefined) return false;
    await tx.delete(guestSessions).where(eq(guestSessions.id, proof.id));
    return true;
  }, READ_COMMITTED);
}
