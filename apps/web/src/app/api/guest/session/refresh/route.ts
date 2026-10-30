import { guestRoute } from "@/server/identity/guest-route";

export const runtime = "nodejs";
/** Synchronizes HttpOnly cookie expiry after accepted socket activity; never touches activity. */
export function POST(request: Request): Promise<Response> { return guestRoute(request, "refresh"); }
