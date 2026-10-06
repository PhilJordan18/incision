import { describe, expect, it, vi } from "vitest";
import { checkSession, SESSION_MAX_AGE_SECONDS, sessionDeadline } from "./session-token";

const accountId = "0b6f3c1e-5d2a-4f7b-9c8e-1a2b3c4d5e6f";
const signedInAt = 1_800_000_000;
const claims = { sub: accountId, sessionVersion: 3, authTime: signedInAt };
const during = sessionDeadline(signedInAt) - 1;

describe("checkSession", () => {
  it("accepts current claims while the database holds the same version", async () => {
    const readVersion = vi.fn(async () => 3);
    expect(await checkSession({ ...claims, iat: 1, exp: 2, jti: "x" }, readVersion, during)).toEqual({
      ok: true,
      claims,
      expiresAt: (signedInAt + SESSION_MAX_AGE_SECONDS) * 1000,
    });
    expect(readVersion).toHaveBeenCalledWith(accountId);
  });

  it("refuses a revoked session: an older version is never upgraded", async () => {
    expect(await checkSession(claims, async () => 4, during)).toEqual({ ok: false, reason: "REVOKED" });
  });

  it("refuses a session of a deleted account", async () => {
    expect(await checkSession(claims, async () => null, during)).toEqual({ ok: false, reason: "ACCOUNT_NOT_FOUND" });
  });

  it("refuses a session 24 hours after sign-in, without reading the database", async () => {
    const readVersion = vi.fn(async () => 3);
    expect(await checkSession(claims, readVersion, sessionDeadline(signedInAt))).toEqual({ ok: false, reason: "EXPIRED" });
    expect(readVersion).not.toHaveBeenCalled();
  });

  it.each([
    ["no claims", {}],
    ["a provider id instead of our UUID", { ...claims, sub: "583231" }],
    ["a missing version", { sub: accountId, authTime: signedInAt }],
    ["a version of 0", { ...claims, sessionVersion: 0 }],
    ["a fractional sign-in time", { ...claims, authTime: 1.5 }],
    ["a sign-in time in the future", { ...claims, authTime: Math.floor(during / 1000) + 3600 }],
    ["a string", "token"],
  ])("refuses malformed claims (%s) without reading the database", async (_label, payload) => {
    const readVersion = vi.fn(async () => 3);
    expect(await checkSession(payload, readVersion, during)).toEqual({ ok: false, reason: "MALFORMED" });
    expect(readVersion).not.toHaveBeenCalled();
  });

  it("lets a database failure propagate, so the caller refuses the session", async () => {
    await expect(checkSession(claims, async () => Promise.reject(new Error("down")), during)).rejects.toThrow("down");
  });
});
