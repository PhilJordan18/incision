import { and, asc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { retireUnreferencedGuest } from "../identity/guest-retirement";
import { guestSessions, lobbies, lobbyMembers } from "../schema";
import type { Transaction } from "../transaction";

/** Writes shared by the room transactions; never exported from the package. */

/**
 * Closes a room whose row the transaction holds locked: every remaining member leaves with it, so
 * nobody stays blocked by the one-active-room index. The caller bumps the revision.
 */
export async function closeLockedRoom(tx: Transaction, lobbyId: string): Promise<void> {
  const guests = await tx.select({ memberId: lobbyMembers.id, sessionId: lobbyMembers.guestSessionId }).from(lobbyMembers)
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), isNotNull(lobbyMembers.guestSessionId)))
    .orderBy(asc(lobbyMembers.guestSessionId));
  for (const guest of guests) {
    if (guest.sessionId !== null) await tx.select({ id: guestSessions.id }).from(guestSessions)
      .where(eq(guestSessions.id, guest.sessionId)).for("update");
  }
  await tx
    .update(lobbyMembers)
    .set({ leftAt: sql`statement_timestamp()` })
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), isNull(lobbyMembers.leftAt)));
  await tx
    .update(lobbies)
    .set({ phase: "closed", closedAt: sql`statement_timestamp()` })
    .where(eq(lobbies.id, lobbyId));
  for (const guest of guests) {
    await tx.update(lobbies).set({ hostMemberId: null }).where(and(eq(lobbies.id, lobbyId), eq(lobbies.hostMemberId, guest.memberId)));
    await tx.delete(lobbyMembers).where(eq(lobbyMembers.id, guest.memberId));
    if (guest.sessionId !== null) await retireUnreferencedGuest(tx, guest.sessionId);
  }
}

/** A new snapshot revision: the members' pages learn the change. */
export async function bumpRevision(tx: Transaction, lobbyId: string): Promise<void> {
  await tx
    .update(lobbies)
    .set({ revision: sql`${lobbies.revision} + 1` })
    .where(eq(lobbies.id, lobbyId));
}
