import { capacityRefusal, type CapacityRefusal, type RoomCode } from "@incision/domain";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { GuestSessionRow } from "../identity/guest-sessions";
import { lobbies, lobbyMembers } from "../schema/rooms";
import { lobbyBots } from "../schema/room-bots";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import type { RoomHostActor } from "./host-actions";
import { completeHostedChange, type HostedRoomRefusal, lockHostedWaitingRoom } from "./hosted-room";

export type ChangeRoomCapacityResult =
  | { readonly ok: true; readonly lobbyId: string; readonly revision: number; readonly guestSession?: GuestSessionRow }
  | { readonly ok: false; readonly error: CapacityRefusal | HostedRoomRefusal };

/** The same lobby lock serializes capacity changes with admissions, roles and bot changes. */
export async function changeRoomCapacity(db: Database, input: RoomHostActor & {
  readonly code: RoomCode;
  readonly revision: number;
  readonly capacity: number;
}): Promise<ChangeRoomCapacityResult> {
  return boundedTransaction(db, async (tx): Promise<ChangeRoomCapacityResult> => {
    const room = await lockHostedWaitingRoom(tx, input);
    if (typeof room === "string") return { ok: false, error: room };
    const [humans] = await tx.select({ value: count() }).from(lobbyMembers).where(and(
      eq(lobbyMembers.lobbyId, room.id), eq(lobbyMembers.role, "participant"), isNull(lobbyMembers.leftAt),
    ));
    const [bots] = await tx.select({ value: count() }).from(lobbyBots).where(eq(lobbyBots.lobbyId, room.id));
    const refusal = capacityRefusal({ capacity: input.capacity, activeParticipants: (humans?.value ?? 0) + (bots?.value ?? 0) });
    if (refusal !== undefined) return { ok: false, error: refusal };
    await tx.update(lobbies).set({ capacity: input.capacity }).where(eq(lobbies.id, room.id));
    return completeHostedChange(tx, input, room);
  }, READ_COMMITTED);
}
