import { firstValidDisplayName } from "@incision/domain";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Discord from "next-auth/providers/discord";
import GitHub from "next-auth/providers/github";
import { authorizeCredentials, credentialChecks } from "@/server/auth/credentials";
import { logAuthError, logAuthWarning } from "@/server/auth/log";
import { defaultRevocationDependencies, revokeOnSignOutEvent } from "@/server/auth/revocation";
import { claimsForSignIn, revalidateClaims } from "@/server/auth/session-callbacks";
import { SESSION_MAX_AGE_SECONDS, sessionClaimsSchema, sessionDeadline } from "@/server/auth/session-token";
import { databaseSessionStore, findCredentials, revokeSessions } from "@/server/auth/store";

const callbackDependencies = { store: databaseSessionStore, now: Date.now };

/**
 * Auth.js v5 (ADR-0003): JWT sessions without adapter, our own tables written from the
 * callbacks. AUTH_SECRET, AUTH_URL and the provider ids and secrets are read by the
 * library from the environment, validated at start-up by parseServerEnv.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  // Bounds the cookie; the 24-hour limit from sign-in is enforced by the claims (D-07).
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  debug: false,
  logger: { error: logAuthError, warn: logAuthWarning, debug: () => undefined },
  // Our translated pages replace Auth.js' English ones (I18N-01).
  pages: { signIn: "/sign-in", error: "/auth/error", signOut: "/account" },
  providers: [
    // Empty scope: public profile only, no email permission. Only the id and a name
    // (the first valid of the provider's name and login) are read.
    GitHub({
      authorization: { params: { scope: "" } },
      profile: (profile) => ({ id: String(profile.id), name: firstValidDisplayName([profile.name, profile.login]) }),
    }),
    Discord({
      // Discord adds `iss` to its redirects (RFC 9207); Auth.js checks it against this
      // issuer before anything else, so without it every Discord callback fails.
      issuer: "https://discord.com",
      authorization: { params: { scope: "identify" } },
      profile: (profile) => ({ id: profile.id, name: firstValidDisplayName([profile.global_name, profile.username]) }),
    }),
    Credentials({
      credentials: { login: {}, password: {} },
      authorize: (input, request) =>
        authorizeCredentials(input, request, { findCredentials, ...credentialChecks() }),
    }),
  ],
  callbacks: {
    jwt: ({ token, account, user }) =>
      account ? claimsForSignIn(account, user, callbackDependencies) : revalidateClaims(token, callbackDependencies),
    // Exposes only our account id and the real end of the session, never a profile.
    session: ({ token }) => {
      const claims = sessionClaimsSchema.parse(token);
      return { user: { id: claims.sub }, expires: new Date(sessionDeadline(claims.authTime)).toISOString() };
    },
  },
  events: {
    signOut: (message) =>
      revokeOnSignOutEvent("token" in message ? { token: message.token } : {}, {
        ...defaultRevocationDependencies(revokeSessions),
        readSessionVersion: databaseSessionStore.readSessionVersion,
      }),
  },
});
