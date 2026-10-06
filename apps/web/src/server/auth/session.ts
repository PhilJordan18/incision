import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { auth } from "@/auth";

export type AccountSession = { readonly accountId: string };

/**
 * Account of the current request, checked against the database by Auth.js' jwt
 * callback (version, expiry, account still present). A request without a session
 * cookie never reaches the database. Memoised for the request.
 */
export const getAccountSession = cache(async (): Promise<AccountSession | null> => {
  const session = await auth();
  const accountId = z.uuid().safeParse(session?.user?.id);
  return accountId.success ? { accountId: accountId.data } : null;
});

/** For protected pages and server actions: no valid session, no access (server-side). */
export async function requireAccountSession(returnTo: string): Promise<AccountSession> {
  const session = await getAccountSession();
  if (session === null) {
    redirect(`/sign-in?${new URLSearchParams({ callbackUrl: returnTo })}`);
  }
  return session;
}
