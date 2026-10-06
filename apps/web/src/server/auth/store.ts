import {
  type Database,
  findLocalCredentials,
  findOrCreateOAuthAccount,
  getDatabase,
  readSessionVersion,
  revokeAccountSessions,
} from "@incision/database";
import { parseServerEnv } from "../config";
import type { SessionStore } from "./session-callbacks";

let databaseUrl: string | undefined;

/**
 * Database of the process, opened on first use: only requests that carry a session or
 * sign in reach it, so anonymous traffic and the liveness probe never touch Neon.
 */
export function authDatabase(): Database {
  databaseUrl ??= parseServerEnv(process.env).databaseUrl;
  if (databaseUrl === undefined) {
    throw new Error("DATABASE_URL is not set: sessions cannot be checked");
  }
  return getDatabase(databaseUrl);
}

export const databaseSessionStore: SessionStore = {
  readSessionVersion: (accountId) => readSessionVersion(authDatabase(), accountId),
  findOrCreateOAuthAccount: (signIn) => findOrCreateOAuthAccount(authDatabase(), signIn),
};

export const findCredentials = (loginCanonical: string) => findLocalCredentials(authDatabase(), loginCanonical);

export const revokeSessions = (accountId: string) => revokeAccountSessions(authDatabase(), accountId);
