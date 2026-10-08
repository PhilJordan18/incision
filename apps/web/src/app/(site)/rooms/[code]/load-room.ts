import { type ActiveMembership, describeDatabaseError, findActiveMembership, findRoomByCode, readRoomSnapshot, type RoomSnapshot } from "@incision/database";
import { admitsNewMembers, type AdmittingPhase, type RoomCode, type RoomPhase } from "@incision/domain";
import { unstable_rethrow } from "next/navigation";
import { cache } from "react";
import { authDatabase } from "@/server/auth/store";
import type { CodeAttemptRefusal } from "@/server/rooms/code-attempt-limiter";
import { codeAttempts, findOwnRoom, lookupSpendsBudget, requestAddressKey } from "@/server/rooms/code-attempts";

/** What a signed-in account finds at `/rooms/<code>`. */
export type RoomPageState =
  | { readonly kind: "member"; readonly snapshot: RoomSnapshot; readonly memberId: string }
  | { readonly kind: "unknown" }
  | { readonly kind: "notAdmitting"; readonly phase: Exclude<RoomPhase, AdmittingPhase> }
  | { readonly kind: "inAnotherRoom"; readonly current: ActiveMembership }
  | { readonly kind: "join" }
  /** The address spent its budget of failed codes, or no lookup slot came free: nothing about the code. */
  | { readonly kind: "throttled"; readonly refusal: CodeAttemptRefusal }
  /** The database did not answer. */
  | { readonly kind: "unavailable" };

/**
 * The state of a room's page for an account, read once per request (the page and its
 * title share it, so a view counts once against the code budget, SALLE-10). Private rooms
 * look exactly like unknown codes. The account's own room is found by account id first,
 * outside the code budget; while the address is over budget that read is bounded per account.
 */
export const loadRoomPage = cache(async (accountId: string, code: RoomCode): Promise<RoomPageState> => {
  try {
    return await readRoomPage(accountId, code);
  } catch (error: unknown) {
    // Next's own control flow (request-time APIs) is not ours to handle.
    unstable_rethrow(error);
    // Logged by shape only: a query's parameters (the code, the account) never reach the logs.
    console.error("[rooms] room page failed:", describeDatabaseError(error));
    return { kind: "unavailable" };
  }
});

async function readRoomPage(accountId: string, code: RoomCode): Promise<RoomPageState> {
  const db = authDatabase();
  const addressKey = await requestAddressKey();
  const own = await findOwnRoom({ addressKey, accountId, code }, (id) => findActiveMembership(db, id));
  if (own.kind === "limited") {
    return { kind: "throttled", refusal: "CODE_RATE_LIMITED" };
  }
  if (own.kind === "own") {
    const snapshot = await readRoomSnapshot(db, own.membership.lobbyId);
    return snapshot === undefined ? { kind: "unknown" } : { kind: "member", snapshot, memberId: own.membership.memberId };
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
  return own.membership === undefined ? { kind: "join" } : { kind: "inAnotherRoom", current: own.membership };
}
