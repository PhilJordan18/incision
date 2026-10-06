import { type ActiveMembership, findActiveMembership, findRoomByCode, readRoomSnapshot, type RoomSnapshot } from "@incision/database";
import { type RoomCode, type RoomPhase } from "@incision/domain";
import { cache } from "react";
import { authDatabase } from "@/server/auth/store";

/** What a signed-in account finds at `/rooms/<code>`. */
export type RoomPageState =
  | { readonly kind: "member"; readonly snapshot: RoomSnapshot; readonly memberId: string }
  | { readonly kind: "unknown" }
  | { readonly kind: "notAdmitting"; readonly phase: Exclude<RoomPhase, "waiting" | "results"> }
  | { readonly kind: "inAnotherRoom"; readonly current: ActiveMembership }
  | { readonly kind: "join" };

/**
 * The state of a room's page for an account, read once per request (the page and its
 * title share it). Private rooms look exactly like unknown codes.
 */
export const loadRoomPage = cache(async (accountId: string, code: RoomCode): Promise<RoomPageState> => {
  const db = authDatabase();
  const current = await findActiveMembership(db, accountId);
  if (current?.code === code) {
    const snapshot = await readRoomSnapshot(db, current.lobbyId);
    return snapshot === undefined ? { kind: "unknown" } : { kind: "member", snapshot, memberId: current.memberId };
  }
  const room = await findRoomByCode(db, code);
  if (room === undefined) {
    return { kind: "unknown" };
  }
  if (room.phase !== "waiting" && room.phase !== "results") {
    return { kind: "notAdmitting", phase: room.phase };
  }
  return current === undefined ? { kind: "join" } : { kind: "inAnotherRoom", current };
});
