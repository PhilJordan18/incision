"use server";

import { expelRoomMember, type ExpelRoomMemberResult } from "@incision/database";
import { unstable_rethrow } from "next/navigation";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { requestGuest, refreshGuestActionCookie } from "@/server/identity/guest-request";
import { parseModerationForm } from "./moderation-form";
import { allowSettingsChange } from "./room-change-limiter";
import { notifyGuestLeft, notifyMemberExpelled, notifyMemberLeft, notifyRoomChanged } from "./room-events";

export type ModerationActionState = {
  readonly error?: Extract<ExpelRoomMemberResult, { ok: false }>["error"] | "INVALID_TARGET" | "RATE_LIMITED" | "UNAVAILABLE";
  readonly revision?: number;
};

function publish(result: Extract<ExpelRoomMemberResult, { ok: true }>): ModerationActionState {
  // Cut the sockets before broadcasting any new room or race data.
  notifyMemberExpelled(result.lobbyId, result.memberId);
  if (result.subject.kind === "guest") notifyGuestLeft(result.lobbyId, result.memberId, false);
  else notifyMemberLeft(result.lobbyId, result.subject.accountId, false);
  notifyRoomChanged(result.lobbyId);
  return { revision: result.revision };
}

export async function expelMemberAction(form: FormData): Promise<ModerationActionState> {
  const { accountId } = await requireAccountSession("/");
  const input = parseModerationForm(form);
  if (input === undefined) return { error: "INVALID_TARGET" };
  if (!allowSettingsChange(accountId)) return { error: "RATE_LIMITED" };
  try {
    const result = await expelRoomMember(authDatabase(), { accountId, ...input });
    return result.ok ? publish(result) : { error: result.error };
  } catch (error) { unstable_rethrow(error); return { error: "UNAVAILABLE" }; }
}

export async function guestExpelMemberAction(form: FormData): Promise<ModerationActionState> {
  try {
    const guest = await requestGuest();
    if (guest === undefined) return { error: "NOT_IN_A_ROOM" };
    const input = parseModerationForm(form);
    if (input === undefined) return { error: "INVALID_TARGET" };
    if (!allowSettingsChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await expelRoomMember(authDatabase(), { accountId: null, guestProof: guest.proof, ...input });
    if (!result.ok) return { error: result.error };
    const answer = publish(result);
    if (result.guestSession !== undefined) await refreshGuestActionCookie(guest, result.guestSession);
    return answer;
  } catch (error) { unstable_rethrow(error); return { error: "UNAVAILABLE" }; }
}
