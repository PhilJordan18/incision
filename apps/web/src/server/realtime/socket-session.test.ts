import { encode } from "next-auth/jwt";
import { describe, expect, it, vi } from "vitest";
import { sessionDeadline } from "../auth/session-token";
import { authenticateHandshake } from "./socket-session";

const secret = "test-secret-of-at-least-thirty-two-characters";
const accountId = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const now = () => 1_800_000_000_000;
const claims = { sub: accountId, sessionVersion: 2, authTime: Math.floor(now() / 1000) - 60 };
const HTTP_COOKIE = "authjs.session-token";
const HTTPS_COOKIE = "__Secure-authjs.session-token";

async function cookieFor(token: Record<string, unknown>, name = HTTP_COOKIE, key = secret): Promise<string> {
  return `${name}=${await encode({ token, secret: key, salt: name })}`;
}

function options(overrides: Partial<Parameters<typeof authenticateHandshake>[1]> = {}) {
  return { secret, secureCookie: false, readVersion: vi.fn(async () => 2), now, ...overrides };
}

describe("authenticateHandshake", () => {
  it("authenticates a valid session cookie, with the deadline of the session", async () => {
    expect(await authenticateHandshake(await cookieFor(claims), options())).toEqual({
      kind: "authenticated",
      session: { accountId, sessionVersion: 2, expiresAt: sessionDeadline(claims.authTime) },
    });
  });

  it("uses the __Secure- cookie, and its salt, behind HTTPS", async () => {
    expect(await authenticateHandshake(await cookieFor(claims, HTTPS_COOKIE), options({ secureCookie: true }))).toMatchObject({
      kind: "authenticated",
    });
    // The plain cookie name is not read over HTTPS.
    expect(await authenticateHandshake(await cookieFor(claims), options({ secureCookie: true }))).toEqual({ kind: "anonymous" });
  });

  it("leaves a handshake without session cookie anonymous, without reading the database", async () => {
    const deps = options();
    expect(await authenticateHandshake(undefined, deps)).toEqual({ kind: "anonymous" });
    expect(await authenticateHandshake("theme=dark", deps)).toEqual({ kind: "anonymous" });
    expect(deps.readVersion).not.toHaveBeenCalled();
  });

  it.each([
    ["a tampered cookie", async () => `${(await cookieFor(claims)).slice(0, -4)}AAAA`],
    ["another secret", async () => cookieFor(claims, HTTP_COOKIE, "another-secret-of-at-least-thirty-two-chars")],
    ["the other cookie's salt", async () => `${HTTP_COOKIE}=${(await cookieFor(claims, HTTPS_COOKIE)).split("=")[1]}`],
    ["garbage", async () => `${HTTP_COOKIE}=not-a-jwt`],
  ])("refuses %s", async (_label, cookie) => {
    expect(await authenticateHandshake(await cookie(), options())).toEqual({ kind: "refused", reason: "INVALID_TOKEN" });
  });

  it("refuses an expired JWT, a session past 24 hours, a revoked one and a deleted account", async () => {
    const expiredJwt = `${HTTP_COOKIE}=${await encode({ token: claims, secret, salt: HTTP_COOKIE, maxAge: -60 })}`;
    expect(await authenticateHandshake(expiredJwt, options({ now: Date.now }))).toMatchObject({ kind: "refused" });
    const old = await cookieFor({ ...claims, authTime: claims.authTime - 24 * 3600 });
    expect(await authenticateHandshake(old, options())).toEqual({ kind: "refused", reason: "EXPIRED" });
    expect(await authenticateHandshake(await cookieFor(claims), options({ readVersion: async () => 3 }))).toEqual({
      kind: "refused",
      reason: "REVOKED",
    });
    expect(await authenticateHandshake(await cookieFor(claims), options({ readVersion: async () => null }))).toEqual({
      kind: "refused",
      reason: "ACCOUNT_NOT_FOUND",
    });
  });

  it("refuses when the version cannot be checked, or without a configured secret", async () => {
    const failing = options({ readVersion: async () => Promise.reject(new Error("down")) });
    expect(await authenticateHandshake(await cookieFor(claims), failing)).toEqual({ kind: "refused", reason: "CHECK_FAILED" });
    expect(await authenticateHandshake(await cookieFor(claims), options({ secret: undefined }))).toEqual({
      kind: "refused",
      reason: "NO_SECRET",
    });
  });
});
