import { and, eq, sql } from "drizzle-orm";
import type { Database } from "../client";
import { firstRow } from "../rows";
import { accounts, oauthIdentities, oauthProvider } from "../schema";
import { limitServerWaits } from "../transaction";

export type OAuthProvider = (typeof oauthProvider.enumValues)[number];
export const OAUTH_PROVIDERS: readonly OAuthProvider[] = oauthProvider.enumValues;

/** What a new session records: our account id and the session version read at sign-in. */
export type SessionAccount = { readonly accountId: string; readonly sessionVersion: number };

export type OAuthSignIn = {
  readonly provider: OAuthProvider;
  readonly providerSubject: string;
  /** Valid display name (D-14), written only if the account is created now. */
  readonly initialDisplayName: string;
};

/**
 * Thrown inside the transaction to roll it back when a concurrent sign-in won. Our own
 * class, created and caught by this module: Next bundles its own copy of drizzle-orm, so
 * drizzle's TransactionRollbackError may come from another copy than the one imported here.
 */
class LostSignInRace extends Error {}

/**
 * Finds the account of a provider identity (AUTH-01), or creates the account and the
 * identity together. Two concurrent first sign-ins of the same identity end on one
 * account: the second identity insert waits for the first transaction, then conflicts;
 * its own transaction rolls back (so its account is not left orphaned) and it reads the
 * winner's committed row.
 */
export async function findOrCreateOAuthAccount(db: Database, signIn: OAuthSignIn): Promise<SessionAccount> {
  const existing = await findOAuthAccount(db, signIn);
  if (existing !== undefined) {
    return existing;
  }
  try {
    return await db.transaction(async (tx) => {
      await limitServerWaits(tx);
      const account = firstRow(
        await tx
          .insert(accounts)
          .values({ displayName: signIn.initialDisplayName })
          .returning({ accountId: accounts.id, sessionVersion: accounts.sessionVersion }),
      );
      const identities = await tx
        .insert(oauthIdentities)
        .values({ accountId: account.accountId, provider: signIn.provider, providerSubject: signIn.providerSubject })
        .onConflictDoNothing({ target: [oauthIdentities.provider, oauthIdentities.providerSubject] })
        .returning({ id: oauthIdentities.id });
      if (identities.length === 0) {
        throw new LostSignInRace();
      }
      return account;
    });
  } catch (error: unknown) {
    if (!(error instanceof LostSignInRace)) {
      throw error;
    }
  }
  const winner = await findOAuthAccount(db, signIn);
  if (winner === undefined) {
    // The winner's account was deleted in between: a later sign-in creates a new one.
    throw new Error("OAuth identity disappeared during a concurrent sign-in");
  }
  return winner;
}

async function findOAuthAccount(db: Database, signIn: OAuthSignIn): Promise<SessionAccount | undefined> {
  const [row] = await db
    .select({ accountId: accounts.id, sessionVersion: accounts.sessionVersion })
    .from(oauthIdentities)
    .innerJoin(accounts, eq(accounts.id, oauthIdentities.accountId))
    .where(and(eq(oauthIdentities.provider, signIn.provider), eq(oauthIdentities.providerSubject, signIn.providerSubject)));
  return row;
}

export type LocalCredentials = SessionAccount & { readonly passwordHash: string | null };

/** Account of a canonical local login (`parseLogin(...).value.canonical`), with its password hash. */
export async function findLocalCredentials(db: Database, loginCanonical: string): Promise<LocalCredentials | undefined> {
  const [row] = await db
    .select({ accountId: accounts.id, sessionVersion: accounts.sessionVersion, passwordHash: accounts.passwordHash })
    .from(accounts)
    .where(eq(accounts.loginCanonical, loginCanonical));
  return row;
}

/** Current session version of an account (a UUID), or `null` when the account does not exist. */
export async function readSessionVersion(db: Database, accountId: string): Promise<number | null> {
  const [row] = await db.select({ sessionVersion: accounts.sessionVersion }).from(accounts).where(eq(accounts.id, accountId));
  return row?.sessionVersion ?? null;
}

/**
 * Revokes every session of the account by incrementing its version in one statement, so
 * concurrent sign-outs each count. Returns the new version, or `null` for a missing account.
 */
export async function revokeAccountSessions(db: Database, accountId: string): Promise<number | null> {
  const [row] = await db
    .update(accounts)
    .set({ sessionVersion: sql`${accounts.sessionVersion} + 1` })
    .where(eq(accounts.id, accountId))
    .returning({ sessionVersion: accounts.sessionVersion });
  return row?.sessionVersion ?? null;
}

/** What the account page shows; never a provider profile. */
export async function readAccountProfile(db: Database, accountId: string): Promise<{ readonly displayName: string } | undefined> {
  const [row] = await db.select({ displayName: accounts.displayName }).from(accounts).where(eq(accounts.id, accountId));
  return row;
}
