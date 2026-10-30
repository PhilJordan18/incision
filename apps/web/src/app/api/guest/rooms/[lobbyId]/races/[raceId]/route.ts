import { readRoomRaceForGuest } from "@incision/database";
import { authDatabase } from "@/server/auth/store";
import { parseServerEnv } from "@/server/config";
import { addressLimitKey, CLIENT_ADDRESS_HEADER } from "@/server/http/client-address";
import { GuestSessionLimiter } from "@/server/identity/guest-session-limiter";
import { guestResultsHttp } from "@/server/races/guest-results-http";
import { temporaryRoomResults } from "@/server/races/temporary-room-results";

const shared = globalThis as typeof globalThis & { incisionGuestResultsLimiter?: GuestSessionLimiter };
export async function GET(request: Request, context: { params: Promise<{ lobbyId: string; raceId: string }> }): Promise<Response> {
  try {
    const env = parseServerEnv(process.env);
    return await guestResultsHttp(request, await context.params, {
      key: process.env.GUEST_SESSION_SECRET, secure: env.secureCookies,
      address: addressLimitKey(request.headers.get(CLIENT_ADDRESS_HEADER) ?? "unknown"),
      limiter: shared.incisionGuestResultsLimiter ??= new GuestSessionLimiter(),
      cache: temporaryRoomResults(), read: (input) => readRoomRaceForGuest(authDatabase(), input),
    });
  } catch {
    return Response.json({ ok: false, error: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  }
}
