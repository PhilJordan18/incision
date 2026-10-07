import { getSessionRegistry, type SessionRegistry } from "../realtime/session-registry";
import { checkSession, SESSION_MAX_AGE_SECONDS, type SessionVersionReader } from "./session-token";

export type RevocationDependencies = {
  /** Increments the account's session version; null when the account no longer exists. */
  readonly revokeSessions: (accountId: string) => Promise<number | null>;
  readonly registry: SessionRegistry;
  readonly now: () => number;
};

/**
 * Sign-out for the checkpoint: every session of the account ends, on every device
 * (ADR-0003, option B). The version increment refuses all JWTs issued before; the open
 * sockets of the account are closed at once. A database failure propagates, so the
 * caller can report that sign-out did not happen.
 */
export async function signOutEverywhere(accountId: string, dependencies: RevocationDependencies): Promise<void> {
  const version = await dependencies.revokeSessions(accountId);
  if (version !== null) {
    // Sessions last at most 24 h: after that, no JWT with an older version can be valid.
    dependencies.registry.revoke(accountId, version, dependencies.now() + SESSION_MAX_AGE_SECONDS * 1000);
  }
}

/**
 * Auth.js `events.signOut`, defence in depth: the built-in POST /api/auth/signout is
 * refused, and the account action revokes before calling `signOut()`, so this normally
 * finds the session already revoked. Only a session that is still valid revokes: an old,
 * already revoked cookie must not let its holder sign the account out again and again.
 */
export async function revokeOnSignOutEvent(
  message: { readonly token?: unknown },
  dependencies: RevocationDependencies & { readonly readSessionVersion: SessionVersionReader },
): Promise<void> {
  const check = await checkSession(message.token, dependencies.readSessionVersion, dependencies.now());
  if (check.ok) {
    await signOutEverywhere(check.claims.sub, dependencies);
  }
}

export function defaultRevocationDependencies(revokeSessions: RevocationDependencies["revokeSessions"]): RevocationDependencies {
  return { revokeSessions, registry: getSessionRegistry(), now: Date.now };
}
