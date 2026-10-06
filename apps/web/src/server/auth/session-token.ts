import { z } from "zod";

/** Absolute lifetime of a session, from sign-in (D-07). Never extended by activity. */
export const SESSION_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * Claims we put in the Auth.js JWT, besides the library's iat/exp/jti. No name, email,
 * picture or provider token: only our account id, the session version read at
 * sign-in and the sign-in time that bounds the session.
 */
export const sessionClaimsSchema = z.object({
  sub: z.uuid(),
  sessionVersion: z.int().min(1),
  authTime: z.int().min(0),
});
export type SessionClaims = z.infer<typeof sessionClaimsSchema>;

export type SessionCheck =
  | { readonly ok: true; readonly claims: SessionClaims; readonly expiresAt: number }
  | { readonly ok: false; readonly reason: "MALFORMED" | "EXPIRED" | "REVOKED" | "ACCOUNT_NOT_FOUND" };

/** Clock skew tolerated on `authTime`, which our own server wrote. */
const AUTH_TIME_SKEW_SECONDS = 60;

/** Reads the current session version of an account; `null` when the account does not exist. */
export type SessionVersionReader = (accountId: string) => Promise<number | null>;

/** Time (ms) when a session signed in at `authTime` (s) stops being valid. */
export function sessionDeadline(authTime: number): number {
  return (authTime + SESSION_MAX_AGE_SECONDS) * 1000;
}

/**
 * Validates decoded claims against the clock and the database. The version recorded
 * at sign-in must equal the account's current one: sign-out increments it, so every
 * JWT issued before is refused. The token is never upgraded to the current version.
 * A database failure propagates: the caller refuses the session (fail closed).
 */
export async function checkSession(payload: unknown, readVersion: SessionVersionReader, now: number): Promise<SessionCheck> {
  const parsed = sessionClaimsSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, reason: "MALFORMED" };
  }
  const claims = parsed.data;
  // A sign-in time in the future would push the 24-hour limit further: never ours.
  if (claims.authTime * 1000 > now + AUTH_TIME_SKEW_SECONDS * 1000) {
    return { ok: false, reason: "MALFORMED" };
  }
  const expiresAt = sessionDeadline(claims.authTime);
  if (now >= expiresAt) {
    return { ok: false, reason: "EXPIRED" };
  }
  const currentVersion = await readVersion(claims.sub);
  if (currentVersion === null) {
    return { ok: false, reason: "ACCOUNT_NOT_FOUND" };
  }
  if (currentVersion !== claims.sessionVersion) {
    return { ok: false, reason: "REVOKED" };
  }
  return { ok: true, claims, expiresAt };
}
