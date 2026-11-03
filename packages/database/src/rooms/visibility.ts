import { isRoomVisibility, type RoomCode, type RoomVisibility } from "@incision/domain";
import { eq } from "drizzle-orm";
import type { Database } from "../client";
import type { GuestSessionRow } from "../identity/guest-sessions";
import { lobbies } from "../schema/rooms";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import type { RoomHostActor } from "./host-actions";
import { completeHostedChange, type HostedRoomRefusal, lockHostedWaitingRoom } from "./hosted-room";

export type ChangeRoomVisibilityResult =
  | { readonly ok: true; readonly lobbyId: string; readonly revision: number; readonly guestSession?: GuestSessionRow }
  | { readonly ok: false; readonly error: "INVALID_VISIBILITY" | HostedRoomRefusal };

/**
 * The host's choice of PUBLIC, CODE or PRIVATE in the waiting room (SALLE-03, CONF-11). Members
 * already present stay; it only changes who may enter next. Code admissions read the visibility
 * under the same lobby lock, so a room made private refuses every code join that follows.
 * Invitations and bans are untouched.
 */
export async function changeRoomVisibility(db: Database, input: RoomHostActor & {
  readonly code: RoomCode;
  readonly revision: number;
  readonly visibility: RoomVisibility;
}): Promise<ChangeRoomVisibilityResult> {
  if (!isRoomVisibility(input.visibility)) return { ok: false, error: "INVALID_VISIBILITY" };
  return boundedTransaction(db, async (tx): Promise<ChangeRoomVisibilityResult> => {
    const room = await lockHostedWaitingRoom(tx, input);
    if (typeof room === "string") return { ok: false, error: room };
    await tx.update(lobbies).set({ visibility: input.visibility }).where(eq(lobbies.id, room.id));
    return completeHostedChange(tx, input, room);
  }, READ_COMMITTED);
}
