import { eq } from "drizzle-orm";
import type { Database } from "../client";
import type { GuestSessionProof } from "../identity/guest-sessions";
import { lobbies } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { lockLiveGuest } from "./guest-host";
import { findActiveHumanMembership, readRoomSnapshot, type RoomSnapshot } from "./membership";

/** Own room only; read-only activity, with expiry and presence fenced against departure. */
export async function readGuestRoom(db: Database, proof: GuestSessionProof, code: string): Promise<{ memberId: string; snapshot: RoomSnapshot } | undefined> {
  return boundedTransaction(db, async (tx) => {
    const membership = () => findActiveHumanMembership(tx, { kind: "guest", guestSessionId: proof.id });
    const seen = await membership();
    if (seen === undefined || seen.code !== code) return undefined;
    await tx.select({ id: lobbies.id }).from(lobbies).where(eq(lobbies.id, seen.lobbyId)).for("update");
    if (!await lockLiveGuest(tx, proof)) return undefined;
    const current = await membership();
    if (current?.memberId !== seen.memberId) return undefined;
    const snapshot = await readRoomSnapshot(tx, seen.lobbyId);
    if (snapshot === undefined || snapshot.phase === "closed" || !await lockLiveGuest(tx, proof)) return undefined;
    return { memberId: seen.memberId, snapshot };
  }, READ_COMMITTED);
}
