import { type ActiveMembership, findActiveMembership, findRoomByCode, readRoomSnapshot, type RoomSnapshot } from "@incision/database";
import { admitsNewMembers, type AdmittingPhase, type RoomCode, type RoomPhase } from "@incision/domain";
import { cache } from "react";
import { authDatabase } from "@/server/auth/store";
import type { CodeAttemptRefusal } from "@/server/rooms/code-attempt-limiter";
import { allowOwnRoomRead, codeAttempts, lookupSpendsBudget, requestAddressKey } from "@/server/rooms/code-attempts";

/** What a signed-in account finds at `/rooms/<code>`. */
export type RoomPageState =
  | { readonly kind: "member"; readonly snapshot: RoomSnapshot; readonly memberId: string }
  | { readonly kind: "unknown" }
  | { readonly kind: "notAdmitting"; readonly phase: Exclude<RoomPhase, AdmittingPhase> }
  | { readonly kind: "inAnotherRoom"; readonly current: ActiveMembership }
  | { readonly kind: "join" }
  /** The address spent its budget of failed codes, or no lookup slot came free: nothing about the code. */
  | { readonly kind: "throttled"; readonly refusal: CodeAttemptRefusal };

/**
 * The state of a room's page for an account, read once per request (the page and its
 * title share it, so a view counts once against the code budget, SALLE-10). Private rooms
 * look exactly like unknown codes. The account's own room is found by account id, outside
 * the code budget; while the address is over budget that read is bounded per account.
 */
export const loadRoomPage = cache(async (accountId: string, code: RoomCode): Promise<RoomPageState> => {
  const addressKey = await requestAddressKey();
  if (!allowOwnRoomRead(addressKey, accountId)) {
    return { kind: "throttled", refusal: "CODE_RATE_LIMITED" };
  }
  const db = authDatabase();
  const current = await findActiveMembership(db, accountId);
  if (current?.code === code) {
    const snapshot = await readRoomSnapshot(db, current.lobbyId);
    return snapshot === undefined ? { kind: "unknown" } : { kind: "member", snapshot, memberId: current.memberId };
  }
  const attempt = await codeAttempts().attempt(addressKey, () => findRoomByCode(db, code), lookupSpendsBudget);
  if (!attempt.ok) {
    return { kind: "throttled", refusal: attempt.refusal };
  }
  const room = attempt.value;
  if (room === undefined) {
    return { kind: "unknown" };
  }
  if (!admitsNewMembers(room.phase)) {
    return { kind: "notAdmitting", phase: room.phase };
  }
  return current === undefined ? { kind: "join" } : { kind: "inAnotherRoom", current };
});
