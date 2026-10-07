import { OAUTH_PROVIDERS, type OAuthProvider, type OAuthSignIn, type SessionAccount } from "@incision/database";
import { initialDisplayName } from "@incision/domain";
import { z } from "zod";
import { checkSession, type SessionClaims, type SessionVersionReader } from "./session-token";

/** What the callbacks need from the database; the real store lives in ./store. */
export type SessionStore = {
  readonly readSessionVersion: SessionVersionReader;
  readonly findOrCreateOAuthAccount: (signIn: OAuthSignIn) => Promise<SessionAccount>;
};

/** The parts of Auth.js' `account` and `user` a sign-in needs; everything else is ignored. */
export type SignInAccount = { readonly provider: string; readonly type: string; readonly providerAccountId: string };
export type SignInUser = { readonly name?: string | null };

const oauthSubjectSchema = z.string().min(1).max(255);
const accountIdSchema = z.uuid();

/**
 * Claims of a new session. For OAuth, the account comes from (provider, subject) only,
 * never from a name or an email; the provider's name only seeds a new account's display
 * name. For credentials, `authorize` already returned our account id. Null refuses.
 */
export async function claimsForSignIn(
  account: SignInAccount,
  user: SignInUser,
  dependencies: { readonly store: SessionStore; readonly now: () => number },
): Promise<SessionClaims | null> {
  const signedIn = await resolveSignInAccount(account, user, dependencies.store);
  if (signedIn === null) {
    return null;
  }
  return { sub: signedIn.accountId, sessionVersion: signedIn.sessionVersion, authTime: Math.floor(dependencies.now() / 1000) };
}

async function resolveSignInAccount(account: SignInAccount, user: SignInUser, store: SessionStore): Promise<SessionAccount | null> {
  if (account.type === "credentials" && account.provider === "credentials") {
    const accountId = accountIdSchema.safeParse(account.providerAccountId);
    if (!accountId.success) {
      return null;
    }
    const sessionVersion = await store.readSessionVersion(accountId.data);
    return sessionVersion === null ? null : { accountId: accountId.data, sessionVersion };
  }
  const provider = account.type === "oauth" ? toOAuthProvider(account.provider) : undefined;
  const subject = oauthSubjectSchema.safeParse(account.providerAccountId);
  if (provider === undefined || !subject.success) {
    return null;
  }
  return store.findOrCreateOAuthAccount({
    provider,
    providerSubject: subject.data,
    initialDisplayName: initialDisplayName([user.name], { provider, subject: subject.data }),
  });
}

function toOAuthProvider(provider: string): OAuthProvider | undefined {
  return OAUTH_PROVIDERS.find((known) => known === provider);
}

/**
 * Every later read of the session (`auth()`, /api/auth/session): the claims must still
 * match the database. Only our claims are kept; Auth.js adds iat/exp/jti again. A
 * database failure propagates: Auth.js then drops the session (fail closed).
 */
export async function revalidateClaims(
  token: unknown,
  dependencies: { readonly store: SessionStore; readonly now: () => number },
): Promise<SessionClaims | null> {
  const check = await checkSession(token, dependencies.store.readSessionVersion, dependencies.now());
  return check.ok ? check.claims : null;
}
