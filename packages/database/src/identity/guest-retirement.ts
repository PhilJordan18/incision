import { and, eq, notExists } from "drizzle-orm";
import { guestSessions, lobbyMembers } from "../schema";
import type { Transaction } from "../transaction";

/** Caller holds room -> session locks and has removed the ended live membership. */
export async function retireUnreferencedGuest(tx: Transaction, id: string): Promise<void> {
  await tx.delete(guestSessions).where(and(eq(guestSessions.id, id), notExists(
    tx.select({ id: lobbyMembers.id }).from(lobbyMembers).where(eq(lobbyMembers.guestSessionId, id)),
  )));
}
