"use server";

import { describeDatabaseError, quickplayAccount, quickplayGuest } from "@incision/database";
import { redirect } from "next/navigation";
import { guestStartSchema } from "@/identity/guest-contract";
import { getAccountSession } from "../auth/session";
import { authDatabase } from "../auth/store";
import { guestEntryEnabled } from "../identity/guest-entry-switch";
import { refreshGuestActionCookie, requestGuest } from "../identity/guest-request";
import type { GuestAdmissionState } from "./guest-admission-action";
import { allowRoomChange } from "./room-change-limiter";
import { notifyRoomChanged } from "./room-events";

export type QuickplayError = "NO_ROOM" | "ALREADY_IN_ANOTHER_ROOM" | "RATE_LIMITED" | "UNAVAILABLE";
export type QuickplayState = { readonly error?: QuickplayError; readonly currentCode?: string };

/**
 * Quickplay for a signed-in account (JOIN-03, D-05): the database picks the admissible PUBLIC
 * room with the fewest free places and admits the account as a participant under the room lock.
 * Without a room it says so; creating one stays the account's own action (D-05, D-19).
 * A visitor without a session goes to the guest entry, in its quickplay mode.
 */
export async function quickplayAction(): Promise<QuickplayState> {
  const session = await getAccountSession();
  if (session === null) redirect("/guest?quickplay=1");
  if (!allowRoomChange(session.accountId)) return { error: "RATE_LIMITED" };
  let result: Awaited<ReturnType<typeof quickplayAccount>>;
  try {
    result = await quickplayAccount(authDatabase(), session.accountId);
  } catch (error: unknown) {
    console.error("[rooms] quickplay failed:", describeDatabaseError(error));
    return { error: "UNAVAILABLE" };
  }
  if (!result.ok) {
    if (result.error === "NO_ROOM") return { error: "NO_ROOM" };
    if (result.error === "ALREADY_IN_ANOTHER_ROOM") return { error: result.error, currentCode: result.currentCode };
    // ACCOUNT_NOT_FOUND: an account deleted meanwhile; its session is refused on the next request.
    return { error: "UNAVAILABLE" };
  }
  if (!result.alreadyMember) notifyRoomChanged(result.lobbyId);
  redirect(`/rooms/${result.code}`);
}

/** Quickplay for a guest (JOIN-03): always as a participant, with the nickname typed for it. */
export async function guestQuickplayAction(form: FormData): Promise<GuestAdmissionState> {
  if (!guestEntryEnabled()) return { error: "UNAVAILABLE" };
  // A hand-made action call can send anything: refuse it instead of throwing.
  if (!(form instanceof FormData)) return { error: "INVALID_GUEST_NICKNAME" };
  const nickname = guestStartSchema.safeParse({ nickname: form.get("nickname") });
  if (!nickname.success) return { error: "INVALID_GUEST_NICKNAME" };
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "UNAUTHORIZED" };
    if (!allowRoomChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const joined = await quickplayGuest(authDatabase(), { proof: guest.proof, nickname: nickname.data.nickname });
    if (!joined.ok) {
      if (joined.error === "INVALID_GUEST_SESSION") return { error: "UNAUTHORIZED" };
      return { error: joined.error };
    }
    if (joined.guestSession !== undefined) await refreshGuestActionCookie(guest, joined.guestSession);
    if (!joined.alreadyMember) notifyRoomChanged(joined.lobbyId);
    return { code: joined.code };
  } catch (error: unknown) {
    console.error("[rooms] guest quickplay failed:", describeDatabaseError(error));
    return { error: "UNAVAILABLE" };
  }
}
