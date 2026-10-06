import { getToken } from "next-auth/jwt";
import { checkSession, type SessionVersionReader } from "../auth/session-token";

export type SocketSession = { readonly accountId: string; readonly sessionVersion: number; readonly expiresAt: number };

export type HandshakeAuthentication =
  | { readonly kind: "anonymous" }
  | { readonly kind: "authenticated"; readonly session: SocketSession }
  | { readonly kind: "refused"; readonly reason: string };

export type SocketSessionOptions = {
  /** AUTH_SECRET, the secret Auth.js encrypts the session cookie with; undefined refuses every cookie. */
  readonly secret: string | undefined;
  /** HTTPS public URL: the cookie is then `__Secure-authjs.session-token`, which is also the key salt. */
  readonly secureCookie: boolean;
  readonly readVersion: SessionVersionReader;
  readonly now?: () => number;
};

/**
 * Reads the Auth.js session of a Socket.IO handshake from its Cookie header only: no
 * Authorization header, nothing from the Socket.IO payload, never a client-sent id.
 * Without a session cookie the socket is anonymous, with no SQL. A cookie that does not
 * decrypt with the secret, has expired, belongs to a deleted account or was revoked is
 * refused, as is any failure to check it.
 */
export async function authenticateHandshake(
  cookieHeader: string | undefined,
  options: SocketSessionOptions,
): Promise<HandshakeAuthentication> {
  const request = { headers: { cookie: cookieHeader ?? "" } };
  const present = await getToken({ req: request, secureCookie: options.secureCookie, raw: true });
  if (!present) {
    return { kind: "anonymous" };
  }
  if (options.secret === undefined) {
    return { kind: "refused", reason: "NO_SECRET" };
  }
  const payload = await getToken({ req: request, secret: options.secret, secureCookie: options.secureCookie });
  if (payload === null) {
    return { kind: "refused", reason: "INVALID_TOKEN" };
  }
  try {
    const check = await checkSession(payload, options.readVersion, (options.now ?? Date.now)());
    if (!check.ok) {
      return { kind: "refused", reason: check.reason };
    }
    const { sub, sessionVersion } = check.claims;
    return { kind: "authenticated", session: { accountId: sub, sessionVersion, expiresAt: check.expiresAt } };
  } catch {
    return { kind: "refused", reason: "CHECK_FAILED" };
  }
}
