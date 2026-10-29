"use server";

import { prepareGuestAccountSignIn, joinRoomByCodeAsGuest } from "@incision/database";
import { MEMBER_ROLES, parseRoomCode } from "@incision/domain";
import { cookies, headers } from "next/headers";
import { z } from "zod";
import { guestStartSchema } from "@/identity/guest-contract";
import { authDatabase } from "../auth/store";
import { parseServerEnv } from "../config";
import { guestEntryEnabled } from "../identity/guest-entry-switch";
import { guestCookieName } from "../identity/guest-cookie";
import { refreshGuestActionCookie, requestGuest } from "../identity/guest-request";
import { hasAccountSessionCookie } from "../identity/request-identity";
import { codeAttempts, requestAddressKey } from "./code-attempts";
import { allowRoomChange } from "./room-change-limiter";
import { notifyRoomChanged } from "./room-events";

export type GuestAdmissionError = "UNAVAILABLE" | "UNAUTHORIZED" | "INVALID_GUEST_NICKNAME" | "INVALID_CODE" |
  "ROOM_NOT_FOUND" | "ROOM_NOT_ADMITTING" | "ROOM_FULL" | "SPECTATORS_FULL" | "ALREADY_IN_ANOTHER_ROOM" |
  "NICKNAME_TAKEN" | "RATE_LIMITED" | "CODE_RATE_LIMITED" | "CODE_BUSY";
export type GuestAdmissionState = { readonly error: GuestAdmissionError } | { readonly code: string };

export async function guestAdmissionAction(form: FormData): Promise<GuestAdmissionState> {
  if (!guestEntryEnabled()) return { error: "UNAVAILABLE" };
  const nickname = guestStartSchema.safeParse({ nickname: form.get("nickname") });
  if (!nickname.success) return { error: "INVALID_GUEST_NICKNAME" };
  const rawCode = form.get("code"); const code = parseRoomCode(typeof rawCode === "string" ? rawCode : "");
  if (!code.ok) return { error: "INVALID_CODE" };
  const role = z.enum(MEMBER_ROLES).safeParse(form.get("role"));
  if (!role.success) return { error: "UNAVAILABLE" };
  try {
    const guest = await requestGuest(); if (guest === undefined) return { error: "UNAUTHORIZED" };
    if (!allowRoomChange(`guest:${guest.proof.id}`)) return { error: "RATE_LIMITED" };
    const result = await codeAttempts().attempt(await requestAddressKey(),
      () => joinRoomByCodeAsGuest(authDatabase(), { proof: guest.proof, code: code.code, nickname: nickname.data.nickname, role: role.data }),
      (joined) => !joined.ok && (joined.error === "ROOM_NOT_FOUND" || joined.error === "ROOM_NOT_ADMITTING" && joined.phase === "closed"));
    if (!result.ok) return { error: result.refusal };
    const joined = result.value;
    if (!joined.ok) return { error: joined.error === "INVALID_GUEST_SESSION" ? "UNAUTHORIZED" : joined.error };
    if (joined.guestSession !== undefined) await refreshGuestActionCookie(guest, joined.guestSession);
    if (!joined.alreadyMember) notifyRoomChanged(joined.lobbyId);
    return { code: code.code };
  } catch { return { error: "UNAVAILABLE" }; }
}

/** Explicitly forget an unusable cookie; never silently replace an active presence. */
export async function resetGuestCookieAction(): Promise<{ readonly error?: GuestAdmissionError }> {
  if (!guestEntryEnabled()) return { error: "UNAVAILABLE" };
  try {
    if (hasAccountSessionCookie((await headers()).get("cookie"))) return { error: "UNAUTHORIZED" };
    const guest = await requestGuest();
    if (guest !== undefined && !await prepareGuestAccountSignIn(authDatabase(), guest.proof)) {
      return { error: "ALREADY_IN_ANOTHER_ROOM" };
    }
    const secure = parseServerEnv(process.env).secureCookies;
    (await cookies()).set(guestCookieName(secure), "", { path: "/", httpOnly: true, sameSite: "lax", secure, maxAge: 0 });
    return {};
  } catch { return { error: "UNAVAILABLE" }; }
}
