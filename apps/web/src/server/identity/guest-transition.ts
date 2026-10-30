import { findActiveHumanMembership, prepareGuestAccountSignIn, readGuestSession } from "@incision/database";
import { headers } from "next/headers";
import { authDatabase } from "../auth/store";
import { parseServerEnv } from "../config";
import { guestSigningKey, readGuestCookie } from "./guest-cookie";

/** Login must not turn an active guest into an account, even with an account cookie present. */
export async function guestPresenceBlocksSignIn(finalize = false): Promise<boolean> {
  const header = (await headers()).get("cookie");
  const key = guestSigningKey(process.env.GUEST_SESSION_SECRET);
  if (key === undefined) return false;
  const cookie = readGuestCookie(header, { secure: parseServerEnv(process.env).secureCookies, key });
  if (cookie.kind !== "valid") return false;
  const db = authDatabase();
  if (finalize) return !await prepareGuestAccountSignIn(db, cookie.credential);
  const session = await readGuestSession(db, cookie.credential);
  if (session.kind !== "valid") return false;
  // Deliberately no catch: a failed verification denies login rather than bypassing it.
  return await findActiveHumanMembership(db, { kind: "guest", guestSessionId: cookie.credential.id }) !== undefined;
}
