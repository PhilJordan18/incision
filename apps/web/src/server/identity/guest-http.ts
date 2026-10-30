import { guestRenewSchema, guestStartSchema } from "@/identity/guest-contract";
import { guestCookieName, guestSetCookie, guestSigningKey } from "./guest-cookie";
import { resolveGuest, type GuestStore } from "./guest-session";
import type { AccountIdentity } from "./request-identity";
import type { GuestSessionLimiter } from "./guest-session-limiter";

export type GuestHttpDependencies = {
  readonly origin: string;
  readonly key: string | undefined;
  readonly store: GuestStore;
  readonly account: (header: string | null) => Promise<AccountIdentity>;
  readonly limiter: GuestSessionLimiter;
  readonly address: (request: Request) => string;
};
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Cross-Origin-Resource-Policy": "same-origin" };
const MAX_BODY_BYTES = 2048;

function failure(error: string, status: number): Response {
  return Response.json({ ok: false, error }, { status, headers: HEADERS });
}

/** Bound streamed bytes as well as Content-Length. No unbounded request.json(). */
async function readBody(request: Request): Promise<unknown> {
  const length = request.headers.get("content-length");
  const type = request.headers.get("content-type")?.toLowerCase();
  if ((type !== "application/json" && type !== "application/json; charset=utf-8") ||
    (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) || request.body === null) {
    void request.body?.cancel().catch(() => undefined);
    return undefined;
  }
  const reader = request.body.getReader();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    void reader.cancel().catch(() => undefined);
  }, 5_000);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return undefined;
      }
      chunks.push(value);
    }
    return timedOut ? undefined : JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)));
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

/** Foundation endpoint only: it cannot create memberships, accounts or race results. */
export async function handleGuestRequest(request: Request, operation: "read" | "start" | "renew" | "refresh", dependencies: GuestHttpDependencies): Promise<Response> {
  const url = new URL(dependencies.origin);
  const secure = url.protocol === "https:";
  if (!secure && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) return failure("UNAVAILABLE", 503);
  if (operation !== "read" && request.headers.get("origin") !== dependencies.origin) return failure("FORBIDDEN", 403);
  const header = request.headers.get("cookie");
  const name = guestCookieName(secure);
  const hasGuest = (header ?? "").split(";").some((part) => part.trim() === name || part.trim().startsWith(`${name}=`));
  const release = dependencies.limiter.acquire(dependencies.address(request), operation === "start" && !hasGuest);
  if (release === undefined) return failure("RATE_LIMITED", 429);
  try {
    const account = await dependencies.account(header);
    if (account.kind === "unavailable") return failure("UNAVAILABLE", 503);
    if (account.kind === "invalid") return failure("UNAUTHORIZED", 401);
    if (account.kind === "account") return failure("ACCOUNT_SESSION_PRESENT", 409);
    const key = guestSigningKey(dependencies.key);
    if (key === undefined) return failure("UNAVAILABLE", 503);
    let nickname: string | undefined;
    if (operation !== "read") {
      const body = await readBody(request);
      if (operation === "start") {
        const parsed = guestStartSchema.safeParse(body);
        if (!parsed.success) return failure("INVALID_GUEST_NICKNAME", 400);
        nickname = parsed.data.nickname;
      } else if (!guestRenewSchema.safeParse(body).success) return failure("INVALID_PAYLOAD", 400);
    }
    const result = await resolveGuest({ cookieHeader: header, secure, key, operation }, dependencies.store);
    if (result.kind === "unavailable") return failure("UNAVAILABLE", 503);
    if (result.kind === "absent" && operation === "read") return Response.json({ ok: true, status: "absent" }, { headers: HEADERS });
    if (result.kind !== "valid") return failure("UNAUTHORIZED", 401);
    // Cookie synchronization reads verified SQL/accepted-runtime activity, never creates activity.
    // Repeating it cannot keep an idle identity alive.
    const remaining = operation === "refresh" ? Math.min(86_400, Math.ceil((result.session.expiresAt.getTime() - Date.now()) / 1000)) : 86_400;
    if (!Number.isFinite(remaining) || remaining <= 0) return failure("UNAUTHORIZED", 401);
    // No identity/proof/deadline in JSON. Nickname is an unpersisted draft for later admission.
    return Response.json({ ok: true, status: "guest", ...(nickname === undefined ? {} : { nickname }) }, {
      headers: { ...HEADERS, ...(operation === "read" ? {} : { "Set-Cookie": guestSetCookie(result.cookie, secure, remaining) }) },
    });
  } catch {
    return failure("UNAVAILABLE", 503);
  } finally {
    release();
  }
}
