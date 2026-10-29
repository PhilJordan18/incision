import type { GuestSessionProof, RaceResultView } from "@incision/database";
import { z } from "zod";
import { guestSigningKey, readGuestCookie } from "../identity/guest-cookie";
import { hasAccountSessionCookie } from "../identity/request-identity";
import type { GuestSessionLimiter } from "../identity/guest-session-limiter";
import type { TemporaryRoomResults } from "./temporary-room-results";

const paramsSchema = z.strictObject({ lobbyId: z.string().uuid(), raceId: z.string().uuid() });
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
export type GuestResultsDependencies = {
  readonly key: string | undefined;
  readonly secure: boolean;
  readonly address: string;
  readonly limiter: GuestSessionLimiter;
  readonly cache: TemporaryRoomResults;
  readonly read: (input: { lobbyId: string; raceId: string; proof: GuestSessionProof }) => Promise<{ memberId: string; view: RaceResultView } | undefined>;
};

/** Read-only, room-scoped, no account fallback, no cookie mutation or renewal. */
export async function guestResultsHttp(request: Request, params: unknown, dependencies: GuestResultsDependencies): Promise<Response> {
  const fail = (error: string, status: number) => Response.json({ ok: false, error }, { status, headers });
  const release = dependencies.limiter.acquire(dependencies.address, false);
  if (release === undefined) return fail("RATE_LIMITED", 429);
  try {
    if (request.method !== "GET") return fail("METHOD_NOT_ALLOWED", 405);
    const cookie = request.headers.get("cookie");
    if (hasAccountSessionCookie(cookie)) return fail("UNAUTHORIZED", 401);
    const key = guestSigningKey(dependencies.key);
    if (key === undefined) return fail("UNAVAILABLE", 503);
    const credential = readGuestCookie(cookie, { secure: dependencies.secure, key });
    if (credential.kind !== "valid") return fail("UNAUTHORIZED", 401);
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) return fail("NOT_FOUND", 404);
    const result = await dependencies.read({ ...parsed.data, proof: credential.credential });
    if (result === undefined) return fail("NOT_FOUND", 404);
    const view = dependencies.cache.apply(parsed.data.lobbyId, result.view, result.memberId);
    return Response.json({ ok: true, race: view }, { headers });
  } catch {
    return fail("UNAVAILABLE", 503);
  } finally { release(); }
}
