import { and, eq, isNull, sql } from "drizzle-orm";
import { lobbies, lobbyMembers } from "../schema";
import type { Transaction } from "../transaction";

/** Writes shared by the room transactions; never exported from the package. */

/**
 * Closes a room whose row the transaction holds locked: every remaining member leaves with it, so
 * nobody stays blocked by the one-active-room index. The caller bumps the revision.
 */
export async function closeLockedRoom(tx: Transaction, lobbyId: string): Promise<void> {
  await tx
    .update(lobbyMembers)
    .set({ leftAt: sql`statement_timestamp()` })
    .where(and(eq(lobbyMembers.lobbyId, lobbyId), isNull(lobbyMembers.leftAt)));
  await tx
    .update(lobbies)
    .set({ phase: "closed", closedAt: sql`statement_timestamp()` })
    .where(eq(lobbies.id, lobbyId));
}

/** A new snapshot revision: the members' pages learn the change. */
export async function bumpRevision(tx: Transaction, lobbyId: string): Promise<void> {
  await tx
    .update(lobbies)
    .set({ revision: sql`${lobbies.revision} + 1` })
    .where(eq(lobbies.id, lobbyId));
}
