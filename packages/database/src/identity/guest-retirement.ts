import { and, eq, inArray, notExists } from "drizzle-orm";
import { guestSessions, lobbyMembers, lobbyBans } from "../schema";
import type { Transaction } from "../transaction";

/** Caller holds room -> session locks and has removed the ended live membership. */
export async function retireUnreferencedGuest(tx: Transaction, id: string): Promise<void> {
  await retireUnreferencedGuests(tx, [id]);
}

/** Batch form for room closure: no query per member, same reference guard. */
export async function retireUnreferencedGuests(tx: Transaction, ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return;
  await tx.delete(guestSessions).where(and(inArray(guestSessions.id, [...ids]), notExists(
    tx.select({ id: lobbyMembers.id }).from(lobbyMembers).where(eq(lobbyMembers.guestSessionId, guestSessions.id)),
  ), notExists(tx.select({ id: lobbyBans.id }).from(lobbyBans)
    .where(eq(lobbyBans.guestSessionId, guestSessions.id)))));
}
