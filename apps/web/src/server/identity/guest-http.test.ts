import { describe, expect, it, vi } from "vitest";
import { handleGuestRequest, type GuestHttpDependencies } from "./guest-http";
import { issueGuestCookie } from "./guest-cookie";
import { GuestSessionLimiter } from "./guest-session-limiter";
import { resolveAccountIdentity } from "./request-identity";

const origin = "https://incision.example";
const key = "guest-http-test-key-only-at-least-32-bytes";
const session = { id: "server-only", expiresAt: new Date("2026-11-01") };
function dependencies(): GuestHttpDependencies {
  return {
    origin, key, limiter: new GuestSessionLimiter(), address: () => "test-address",
    account: vi.fn(async () => ({ kind: "absent" as const })),
    store: { create: vi.fn(async () => session), read: vi.fn(async () => ({ kind: "valid" as const, session })), touch: vi.fn(async () => ({ kind: "valid" as const, session })) },
  };
}
function request(options: { cookie?: string; body?: string; origin?: string; method?: string } = {}): Request {
  const method = options.method ?? "POST";
  return new Request(`${origin}/api/guest/session`, {
    method, headers: { Origin: options.origin ?? origin, "Content-Type": "application/json", ...(options.cookie ? { Cookie: options.cookie } : {}) },
    ...(method === "GET" ? {} : { body: options.body ?? JSON.stringify({ nickname: "  Ｅva  " }) }),
  });
}

describe("guest HTTP foundation", () => {
  it("creates an identity only on explicit POST and returns no credential in JSON", async () => {
    const deps = dependencies();
    const response = await handleGuestRequest(request(), "start", deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, status: "guest", nickname: "Eva" });
    expect(response.headers.get("set-cookie")).toMatch(/^__Host-incision.guest=v1\./);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly; SameSite=Lax; Secure");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(deps.store.create).toHaveBeenCalledTimes(1);
  });

  it("reads without issuing or renewing, including a missing cookie", async () => {
    const deps = dependencies();
    expect(await (await handleGuestRequest(request({ method: "GET" }), "read", deps)).json()).toEqual({ ok: true, status: "absent" });
    const cookie = issueGuestCookie(key);
    const result = await handleGuestRequest(request({ method: "GET", cookie: `__Host-incision.guest=${cookie.value}` }), "read", deps);
    expect(result.headers.has("set-cookie")).toBe(false);
    expect(deps.store.read).toHaveBeenCalledWith(cookie.credential);
    expect(deps.store.touch).not.toHaveBeenCalled();
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("two tabs resume one proof and renewal keeps its cookie stable", async () => {
    const deps = dependencies();
    const cookie = issueGuestCookie(key);
    const results = await Promise.all(Array.from({ length: 2 }, () => handleGuestRequest(request({ cookie: `__Host-incision.guest=${cookie.value}`, body: "{}" }), "renew", deps)));
    expect(results.every((result) => result.status === 200)).toBe(true);
    expect(results[0]?.headers.get("set-cookie")).toBe(results[1]?.headers.get("set-cookie"));
    expect(deps.store.touch).toHaveBeenCalledTimes(2);
    expect(deps.store.touch).toHaveBeenCalledWith(cookie.credential);
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it.each(["https://evil.example", "null", ""])("rejects Origin %j before identity or storage", async (wrongOrigin) => {
    const deps = dependencies();
    const input = request({ origin: wrongOrigin });
    if (wrongOrigin === "") input.headers.delete("origin");
    expect((await handleGuestRequest(input, "start", deps)).status).toBe(403);
    expect(deps.account).not.toHaveBeenCalled();
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it.each(["not json", "null", "[]", '{"nickname":"ab"}', '{"nickname":"abc","accountId":"forged"}', '{"nickname":3}', JSON.stringify({ nickname: "a".repeat(3000) })])("rejects invalid body %j", async (body) => {
    const deps = dependencies();
    expect((await handleGuestRequest(request({ body }), "start", deps)).status).toBe(400);
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("bounds unknown-length streams and refuses content type/body on renewal", async () => {
    const deps = dependencies();
    const input = request({ body: "{}" });
    input.headers.set("content-type", "text/plain");
    expect((await handleGuestRequest(input, "renew", deps)).status).toBe(400);
    expect((await handleGuestRequest(request({ body: '{"guestSessionId":"forged"}' }), "renew", deps)).status).toBe(400);
    expect((await handleGuestRequest(request({ body: "{}" }), "renew", deps)).status).toBe(401);
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it("releases the concurrency slot when a body never finishes", async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies();
      const init = {
        method: "POST", duplex: "half",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{}")); } }),
      };
      const pending = handleGuestRequest(new Request(`${origin}/api/guest/session`, init), "start", deps);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await pending).status).toBe(400);
      expect(deps.store.create).not.toHaveBeenCalled();
      const release = deps.limiter.acquire("test-address", false);
      expect(release).toBeDefined();
      release?.();
    } finally { vi.useRealTimers(); }
  });

  it("keeps other addresses available while slow renewal bodies time out", async () => {
    vi.useFakeTimers();
    try {
      const deps = dependencies();
      const pending = Array.from({ length: 2 }, () => {
        const init = {
          method: "POST", duplex: "half",
          headers: { Origin: origin, "Content-Type": "application/json" },
          body: new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode("{}")); } }),
        };
        return handleGuestRequest(new Request(`${origin}/api/guest/session/renew`, init), "renew", deps);
      });
      expect((await handleGuestRequest(request({ body: "{}" }), "renew", deps)).status).toBe(429);
      expect((await handleGuestRequest(request({ method: "GET" }), "read", { ...deps, address: () => "other-address" })).status).toBe(200);
      await vi.advanceTimersByTimeAsync(5000);
      expect((await Promise.all(pending)).map((response) => response.status)).toEqual([400, 400]);
      const releases = Array.from({ length: 2 }, () => deps.limiter.acquire("test-address", false));
      expect(releases.every(Boolean)).toBe(true);
      releases.forEach((release) => release?.());
    } finally { vi.useRealTimers(); }
  });

  it("invalid signatures never query storage or fall through to creation", async () => {
    const deps = dependencies();
    const response = await handleGuestRequest(request({ cookie: "__Host-incision.guest=forged" }), "start", deps);
    expect(response.status).toBe(401);
    expect(response.headers.has("set-cookie")).toBe(false);
    for (const fn of Object.values(deps.store)) expect(fn).not.toHaveBeenCalled();
  });

  it.each(["invalid", "expired", "unavailable"] as const)("does not replace a %s session", async (kind) => {
    const deps = dependencies();
    const touch = vi.fn(async () => {
      if (kind === "unavailable") throw new Error("private database message");
      return { kind };
    });
    const response = await handleGuestRequest(request({ cookie: `__Host-incision.guest=${issueGuestCookie(key).value}` }), "start", { ...deps, store: { ...deps.store, touch } });
    expect(response.status).toBe(kind === "unavailable" ? 503 : 401);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(await response.text()).not.toContain("private");
    expect(deps.store.create).not.toHaveBeenCalled();
  });

  it.each(["invalid", "unavailable", "account"] as const)("account %s blocks guest creation/resumption", async (kind) => {
    const deps = dependencies();
    const account: GuestHttpDependencies["account"] = async () => kind === "account" ? { kind, subject: { kind, accountId: "account" } } : { kind };
    const response = await handleGuestRequest(request({ cookie: `__Host-incision.guest=${issueGuestCookie(key).value}` }), "start", { ...deps, account });
    expect(response.status).toBe(kind === "account" ? 409 : kind === "invalid" ? 401 : 503);
    for (const fn of Object.values(deps.store)) expect(fn).not.toHaveBeenCalled();
  });

  it("fails closed with missing key or insecure non-local configuration", async () => {
    expect((await handleGuestRequest(request(), "start", { ...dependencies(), key: undefined })).status).toBe(503);
    expect((await handleGuestRequest(request(), "start", { ...dependencies(), origin: "http://incision.example" })).status).toBe(503);
  });
});

describe("account/guest separation", () => {
  it("does not call Auth.js for guest-only cookies", async () => {
    const verify = vi.fn();
    expect(await resolveAccountIdentity("incision.guest=abc", verify)).toEqual({ kind: "absent" });
    expect(verify).not.toHaveBeenCalled();
  });
  it("blocks fallback for empty/chunked account cookies and unavailable verification", async () => {
    expect(await resolveAccountIdentity("authjs.session-token=", async () => ({ kind: "anonymous" }))).toEqual({ kind: "invalid" });
    expect(await resolveAccountIdentity("__Secure-authjs.session-token.0=abc", async () => ({ kind: "refused", reason: "CHECK_FAILED" }))).toEqual({ kind: "unavailable" });
    expect(await resolveAccountIdentity("authjs.session-token=abc", async () => ({ kind: "refused", reason: "REVOKED" }))).toEqual({ kind: "invalid" });
    expect(await resolveAccountIdentity("authjs.session-token.bad=abc", async () => ({ kind: "refused", reason: "INVALID_TOKEN" }))).toEqual({ kind: "invalid" });
  });
});

describe("read-only guest cookie deadline synchronization", () => {
  it("sets only the remaining lifetime without creating or renewing SQL identity", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-29T00:00:00Z") });
    try {
      const deps = dependencies();
      const cookie = issueGuestCookie(key);
      vi.mocked(deps.store.read).mockResolvedValue({ kind: "valid", session: { id: cookie.credential.id, expiresAt: new Date(Date.now() + 60_000) } });
      const input = () => request({ cookie: `__Host-incision.guest=${cookie.value}`, body: "{}" });
      expect((await handleGuestRequest(input(), "refresh", deps)).headers.get("set-cookie")).toContain("Max-Age=60;");
      vi.advanceTimersByTime(10_000);
      expect((await handleGuestRequest(input(), "refresh", deps)).headers.get("set-cookie")).toContain("Max-Age=50;");
      vi.advanceTimersByTime(50_000);
      expect((await handleGuestRequest(input(), "refresh", deps)).status).toBe(401);
      expect(deps.store.touch).not.toHaveBeenCalled(); expect(deps.store.create).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("requires same-origin POST body validation and refuses absent identity", async () => {
    const deps = dependencies();
    expect((await handleGuestRequest(request({ origin: "https://evil.example", body: "{}" }), "refresh", deps)).status).toBe(403);
    expect((await handleGuestRequest(request({ body: '{"activity":true}' }), "refresh", deps)).status).toBe(400);
    expect((await handleGuestRequest(request({ body: "{}" }), "refresh", deps)).status).toBe(401);
    expect(deps.store.touch).not.toHaveBeenCalled(); expect(deps.store.create).not.toHaveBeenCalled();
  });
});
