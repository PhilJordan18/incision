import { capacityRefusal, type CapacityRefusal, type RoomCode } from "@incision/domain";
import { and, count, eq, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { GuestSessionRow } from "../identity/guest-sessions";
import { lobbies, lobbyMembers } from "../schema/rooms";
import { lobbyBots } from "../schema/room-bots";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { lockLiveGuest, renewGuestAfterHostAction } from "./guest-host";
import type { RoomHostActor } from "./host-actions";
import { findActiveHumanMembership, findActiveMembership } from "./membership";
import { bumpRevision } from "./room-writes";

export type ChangeRoomCapacityResult =
  | { readonly ok: true; readonly lobbyId: string; readonly revision: number; readonly guestSession?: GuestSessionRow }
  | { readonly ok: false; readonly error: CapacityRefusal | "NOT_IN_A_ROOM" | "NOT_HOST" | "ROOM_NOT_WAITING" | "STALE_REVISION" };

/** The same lobby lock serializes capacity changes with admissions, roles and bot changes. */
export async function changeRoomCapacity(db: Database, input: RoomHostActor & {
  readonly code: RoomCode;
  readonly revision: number;
  readonly capacity: number;
}): Promise<ChangeRoomCapacityResult> {
  return boundedTransaction(db, async (tx): Promise<ChangeRoomCapacityResult> => {
    const membership = () => input.accountId === null
      ? findActiveHumanMembership(tx, { kind: "guest", guestSessionId: input.guestProof.id })
      : findActiveMembership(tx, input.accountId);
    const seen = await membership();
    if (seen === undefined || seen.code !== input.code) return { ok: false, error: "NOT_IN_A_ROOM" };
    const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, seen.lobbyId)).for("update");
    if (input.accountId === null && !await lockLiveGuest(tx, input.guestProof)) return { ok: false, error: "NOT_IN_A_ROOM" };
    const current = await membership();
    if (room === undefined || current?.memberId !== seen.memberId) return { ok: false, error: "NOT_IN_A_ROOM" };
    if (room.hostMemberId !== current.memberId) return { ok: false, error: "NOT_HOST" };
    if (room.phase !== "waiting") return { ok: false, error: "ROOM_NOT_WAITING" };
    if (room.revision !== input.revision) return { ok: false, error: "STALE_REVISION" };
    const [humans] = await tx.select({ value: count() }).from(lobbyMembers).where(and(
      eq(lobbyMembers.lobbyId, room.id), eq(lobbyMembers.role, "participant"), isNull(lobbyMembers.leftAt),
    ));
    const [bots] = await tx.select({ value: count() }).from(lobbyBots).where(eq(lobbyBots.lobbyId, room.id));
    const refusal = capacityRefusal({ capacity: input.capacity, activeParticipants: (humans?.value ?? 0) + (bots?.value ?? 0) });
    if (refusal !== undefined) return { ok: false, error: refusal };
    await tx.update(lobbies).set({ capacity: input.capacity }).where(eq(lobbies.id, room.id));
    await bumpRevision(tx, room.id);
    return { ok: true, lobbyId: room.id, revision: room.revision + 1,
      ...(input.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, input.guestProof.id) } : {}),
    };
  }, READ_COMMITTED);
}
