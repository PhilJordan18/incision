import { revalidatePath } from "next/cache";
import { parseServerEnv } from "@/server/config";
import { readPhotoForm } from "@/server/profile/photo-body";
import { uploadProfilePhoto, type PhotoState } from "@/server/profile/photo-upload";
import { readProfilePhoto, saveProfilePhoto } from "@incision/database";
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

/** Native multipart POST also works without JavaScript; it never enters the Server Action parser. */
export async function POST(request: Request): Promise<Response> {
  const origin = parseServerEnv(process.env).appOrigin;
  if (request.headers.get("origin") !== origin) return new Response(null, { status: 403, headers });
  const session = await getAccountSession();
  if (session === null) return new Response(null, { status: 401, headers });
  let state: PhotoState;
  try {
    const form = await readPhotoForm(request);
    state = form === undefined ? { status: "invalid" } : await uploadProfilePhoto(
      { accountId: session.accountId, form }, (input) => saveProfilePhoto(authDatabase(), input),
    );
    if (state.status === "saved") revalidatePath("/account");
  } catch {
    state = { status: "unavailable" };
  }
  if (request.headers.get("accept") === "application/json") return Response.json(state, { headers });
  // Fixed same-site destination and enum value, never a user-provided redirect.
  return new Response(null, { status: 303, headers: { ...headers, Location: `/account?photo=${state.status}#profile-photo` } });
}
