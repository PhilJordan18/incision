import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export const { GET } = handlers;

/**
 * Sign-out goes through the account page's server action, which revokes every session and
 * reports a failure. Auth.js' built-in endpoint would swallow a failed revocation and
 * still clear the cookie, leaving the other devices signed in: it is refused.
 */
export function POST(request: NextRequest): Promise<Response> | Response {
  // Auth.js also accepts a trailing slash.
  if (/\/signout\/?$/.test(request.nextUrl.pathname)) {
    return Response.json({ error: "SIGN_OUT_FROM_THE_ACCOUNT_PAGE" }, { status: 405 });
  }
  return handlers.POST(request);
}
