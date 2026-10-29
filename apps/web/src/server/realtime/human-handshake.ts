import type { GuestSessionRead } from "@incision/database";
import { guestCookieName, guestSigningKey, readGuestCookie, type GuestCredential } from "../identity/guest-cookie";
import { hasAccountSessionCookie } from "../identity/request-identity";
import { authenticateHandshake, type HandshakeAuthentication, type SocketSessionOptions } from "./socket-session";

export type GuestSocketSession = { readonly proof: GuestCredential; readonly expiresAt: number };
export type HumanHandshake = HandshakeAuthentication | { readonly kind: "guest"; readonly session: GuestSocketSession };
export type GuestSessionReader = (proof: GuestCredential) => Promise<GuestSessionRead>;

/** One credential source for sockets. Reading a guest never renews or creates its session. */
export async function authenticateHumanHandshake(header: string | undefined, options: SocketSessionOptions & {
  readonly guestKey: string | undefined;
  readonly readGuest: GuestSessionReader;
}): Promise<HumanHandshake> {
  try {
    if (hasAccountSessionCookie(header ?? null)) {
      const account = await authenticateHandshake(header, options);
      return account.kind === "anonymous" ? { kind: "refused", reason: "MALFORMED" } : account;
    }
    const name = guestCookieName(options.secureCookie);
    const present = (header ?? "").split(";").some((part) => part.trim() === name || part.trim().startsWith(`${name}=`));
    if (!present) return { kind: "anonymous" };
    const key = guestSigningKey(options.guestKey);
    if (key === undefined) return { kind: "refused", reason: "NO_SECRET" };
    const parsed = readGuestCookie(header ?? null, { secure: options.secureCookie, key });
    if (parsed.kind !== "valid") return { kind: "refused", reason: "MALFORMED" };
    const result = await options.readGuest(parsed.credential);
    if (result.kind !== "valid") return { kind: "refused", reason: result.kind === "expired" ? "EXPIRED" : "INVALID_TOKEN" };
    const expiresAt = result.session.expiresAt.getTime();
    if (result.session.id !== parsed.credential.id || !Number.isFinite(expiresAt)) return { kind: "refused", reason: "CHECK_FAILED" };
    if (expiresAt <= (options.now ?? Date.now)()) return { kind: "refused", reason: "EXPIRED" };
    return { kind: "guest", session: { proof: parsed.credential, expiresAt } };
  } catch {
    return { kind: "refused", reason: "CHECK_FAILED" };
  }
}
