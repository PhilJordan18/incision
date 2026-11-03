import type { RoomCode } from "@incision/domain";
import { eq } from "drizzle-orm";
import type { GuestSessionRow } from "../identity/guest-sessions";
import { lobbies } from "../schema/rooms";
import type { Transaction } from "../transaction";
import { lockLiveGuest, renewGuestAfterHostAction } from "./guest-host";
import type { RoomHostActor } from "./host-actions";
import { findActiveHumanMembership, findActiveMembership } from "./membership";
import { bumpRevision } from "./room-writes";

export type HostedRoomRefusal = "NOT_IN_A_ROOM" | "NOT_HOST" | "ROOM_NOT_WAITING" | "STALE_REVISION";
export type HostedRoom = typeof lobbies.$inferSelect;

/**
 * Locks the actor's own waiting room for a host change of its access (capacity, visibility):
 * membership is read again under the lobby lock, so the same lock serializes the change with
 * admissions, roles, bots and moderation. The revision is the one the host's page shows.
 */
export async function lockHostedWaitingRoom(tx: Transaction, input: RoomHostActor & {
  readonly code: RoomCode;
  readonly revision: number;
}): Promise<HostedRoom | HostedRoomRefusal> {
  const membership = () => input.accountId === null
    ? findActiveHumanMembership(tx, { kind: "guest", guestSessionId: input.guestProof.id })
    : findActiveMembership(tx, input.accountId);
  const seen = await membership();
  if (seen === undefined || seen.code !== input.code) return "NOT_IN_A_ROOM";
  const [room] = await tx.select().from(lobbies).where(eq(lobbies.id, seen.lobbyId)).for("update");
  if (input.accountId === null && !await lockLiveGuest(tx, input.guestProof)) return "NOT_IN_A_ROOM";
  const current = await membership();
  if (room === undefined || current?.memberId !== seen.memberId) return "NOT_IN_A_ROOM";
  if (room.hostMemberId !== current.memberId) return "NOT_HOST";
  if (room.phase !== "waiting") return "ROOM_NOT_WAITING";
  if (room.revision !== input.revision) return "STALE_REVISION";
  return room;
}

/** After the locked write: members' snapshots move on, and a guest host's session is renewed. */
export async function completeHostedChange(tx: Transaction, actor: RoomHostActor, room: HostedRoom): Promise<{
  readonly ok: true; readonly lobbyId: string; readonly revision: number; readonly guestSession?: GuestSessionRow;
}> {
  await bumpRevision(tx, room.id);
  return { ok: true, lobbyId: room.id, revision: room.revision + 1,
    ...(actor.accountId === null ? { guestSession: await renewGuestAfterHostAction(tx, actor.guestProof.id) } : {}),
  };
}
