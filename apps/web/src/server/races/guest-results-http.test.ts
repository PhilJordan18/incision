import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { issueGuestCookie } from "../identity/guest-cookie";
import { GuestSessionLimiter } from "../identity/guest-session-limiter";
import { guestResultsHttp, type GuestResultsDependencies } from "./guest-results-http";
import { TemporaryRoomResults } from "./temporary-room-results";
const key = "synthetic-guest-results-key-at-least-32-bytes";
const params = { lobbyId: randomUUID(), raceId: randomUUID() };
function setup() {
  const cookie = issueGuestCookie(key);
  const read = vi.fn<GuestResultsDependencies["read"]>(async () => ({ memberId: "member", view: {
    raceId: params.raceId, roundNo: 1, state: "finished", interruptionReason: null,
    countdownAt: new Date(0), startedAt: new Date(0), endedAt: new Date(1), entrants: [],
  } }));
  const deps: GuestResultsDependencies = { key, secure: true, address: "test", limiter: new GuestSessionLimiter(), cache: new TemporaryRoomResults(), read };
  const request = (value = `__Host-incision.guest=${cookie.value}`) => new Request("https://example.test/results", { headers: { Cookie: value } });
  return { deps, read, request, cookie };
}
describe("guest results HTTP privacy", () => {
  it("returns only a currently authorized view with private no-store and never sets a cookie", async () => {
    const f = setup(); const response = await guestResultsHttp(f.request(), params, f.deps);
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("vary")).toBe("Cookie"); expect(response.headers.has("set-cookie")).toBe(false);
    expect(f.read).toHaveBeenCalledExactlyOnceWith({ ...params, proof: f.cookie.credential });
    expect(JSON.stringify(await response.json())).not.toContain(f.cookie.credential.id);
  });
  it.each(["", "__Host-incision.guest=forged", "authjs.session-token.bad=x"])("refuses absent/malformed/account cookies before SQL: %s", async (header) => {
    const f = setup(); expect((await guestResultsHttp(f.request(header), params, f.deps)).status).toBe(401);
    expect(f.read).not.toHaveBeenCalled();
  });
  it("gives the same response for an unknown race, expired identity or ended presence", async () => {
    const f = setup(); f.read.mockResolvedValue(undefined);
    const response = await guestResultsHttp(f.request(), params, f.deps);
    expect(response.status).toBe(404); expect(await response.json()).toEqual({ ok: false, error: "NOT_FOUND" });
  });
  it("bounds concurrent reads before SQL and contains database failures", async () => {
    const f = setup(); let release = () => {}; const pending = new Promise<void>((resolve) => { release = resolve; });
    f.read.mockImplementation(async () => { await pending; throw new Error("private SQL text"); });
    const a = guestResultsHttp(f.request(), params, f.deps), b = guestResultsHttp(f.request(), params, f.deps);
    expect((await guestResultsHttp(f.request(), params, f.deps)).status).toBe(429);
    release(); for (const result of await Promise.all([a, b])) {
      expect(result.status).toBe(503); expect(await result.text()).not.toContain("SQL");
    }
  });
});
