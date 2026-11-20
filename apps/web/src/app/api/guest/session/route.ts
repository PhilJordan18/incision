import { guestRoute } from "@/server/identity/guest-route";

export const runtime = "nodejs";
export function GET(request: Request): Promise<Response> { return guestRoute(request, "read"); }
export function POST(request: Request): Promise<Response> { return guestRoute(request, "start"); }
