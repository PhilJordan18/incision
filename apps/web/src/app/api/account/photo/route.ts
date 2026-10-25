import { readProfilePhoto } from "@incision/database";
import { getAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** The query string only refreshes the browser URL; it never selects an account or image. */
export async function GET(): Promise<Response> {
  const session = await getAccountSession();
  if (session === null) return new Response(null, { status: 401, headers });
  try {
    const webp = await readProfilePhoto(authDatabase(), session.accountId);
    if (webp === undefined) return new Response(null, { status: 404, headers });
    return new Response(new Uint8Array(webp), { headers: { ...headers, "Content-Type": "image/webp" } });
  } catch {
    return new Response(null, { status: 503, headers });
  }
}
