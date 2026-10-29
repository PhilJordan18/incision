import { createGuestSession, readGuestSession, readSessionVersion, touchGuestSession } from "@incision/database";
import { authDatabase } from "../auth/store";
import { parseServerEnv } from "../config";
import { addressLimitKey, CLIENT_ADDRESS_HEADER } from "../http/client-address";
import { authenticateHandshake } from "../realtime/socket-session";
import { handleGuestRequest } from "./guest-http";
import { GuestSessionLimiter } from "./guest-session-limiter";
import { resolveAccountIdentity } from "./request-identity";

const shared = globalThis as typeof globalThis & { incisionGuestLimiter?: GuestSessionLimiter };

export async function guestRoute(request: Request, operation: "read" | "start" | "renew"): Promise<Response> {
  try {
    const env = parseServerEnv(process.env);
    shared.incisionGuestLimiter ??= new GuestSessionLimiter();
    return await handleGuestRequest(request, operation, {
      origin: env.appOrigin,
      // Optional feature configuration: absence disables guest endpoints, not account sign-in.
      key: process.env.GUEST_SESSION_SECRET,
      limiter: shared.incisionGuestLimiter,
      address: (req) => addressLimitKey(req.headers.get(CLIENT_ADDRESS_HEADER) ?? "unknown"),
      account: (header) => resolveAccountIdentity(header, (cookie) => authenticateHandshake(cookie, {
        secret: env.authSecret, secureCookie: env.secureCookies,
        readVersion: (id) => readSessionVersion(authDatabase(), id),
      })),
      store: {
        create: (proof) => createGuestSession(authDatabase(), proof),
        read: (proof) => readGuestSession(authDatabase(), proof),
        touch: (proof) => touchGuestSession(authDatabase(), proof),
      },
    });
  } catch {
    return Response.json({ ok: false, error: "UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
