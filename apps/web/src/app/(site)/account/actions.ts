"use server";

import { redirect } from "next/navigation";
import { signOut } from "@/auth";
import { defaultRevocationDependencies, signOutEverywhere } from "@/server/auth/revocation";
import { getAccountSession } from "@/server/auth/session";
import { revokeSessions } from "@/server/auth/store";

export type SignOutState = { readonly failed: boolean };

/**
 * Protected server action: without a valid session it does nothing (SEC-01, checked on
 * the server, not by the page that shows the button). It revokes every session of the
 * account and closes its sockets, then deletes this browser's cookie.
 */
export async function signOutEverywhereAction(): Promise<SignOutState> {
  const session = await getAccountSession();
  if (session === null) {
    redirect("/sign-in");
  }
  try {
    await signOutEverywhere(session.accountId, defaultRevocationDependencies(revokeSessions));
  } catch {
    // The database did not record the revocation: keep the user signed in and say so.
    return { failed: true };
  }
  await signOut({ redirectTo: "/" });
  return { failed: false };
}
