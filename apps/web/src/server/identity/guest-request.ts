import { readGuestSession, type GuestSessionRow } from "@incision/database";
import { cookies, headers } from "next/headers";
import { authDatabase } from "../auth/store";
import { parseServerEnv } from "../config";
import { getSessionRegistry } from "../realtime/session-registry";
import { guestCookieName, guestSigningKey, readGuestCookie } from "./guest-cookie";
import { hasAccountSessionCookie } from "./request-identity";

/** Server-only proof, never passed as a component prop or client action argument. */
export async function requestGuest() {
  const header = (await headers()).get("cookie");
  if (hasAccountSessionCookie(header)) return undefined;
  const env = parseServerEnv(process.env), key = guestSigningKey(process.env.GUEST_SESSION_SECRET);
  if (key === undefined) return undefined;
  const cookie = readGuestCookie(header, { secure: env.secureCookies, key });
  if (cookie.kind !== "valid") return undefined;
  const verified = await readGuestSession(authDatabase(), cookie.credential);
  return verified.kind === "valid" ? { proof: cookie.credential, value: cookie.value, secure: env.secureCookies } : undefined;
}

/** Synchronize only a deadline returned by an accepted SQL action. */
export async function refreshGuestActionCookie(guest: NonNullable<Awaited<ReturnType<typeof requestGuest>>>, session: GuestSessionRow): Promise<void> {
  const remaining = Math.min(86_400, Math.ceil((session.expiresAt.getTime() - Date.now()) / 1000));
  if (session.id !== guest.proof.id || remaining <= 0) return;
  getSessionRegistry().refreshGuest(session.id, session.expiresAt.getTime());
  (await cookies()).set(guestCookieName(guest.secure), guest.value, {
    path: "/", httpOnly: true, sameSite: "lax", secure: guest.secure, maxAge: remaining,
  });
}

export async function clearGuestActionCookie(guest: NonNullable<Awaited<ReturnType<typeof requestGuest>>>): Promise<void> {
  getSessionRegistry().revokeGuest(guest.proof.id);
  (await cookies()).set(guestCookieName(guest.secure), "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: guest.secure });
}
