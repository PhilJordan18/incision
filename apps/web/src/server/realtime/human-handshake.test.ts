import { encode } from "next-auth/jwt";
import { describe, expect, it, vi } from "vitest";
import type { GuestSessionRead } from "@incision/database";
import { issueGuestCookie } from "../identity/guest-cookie";
import { authenticateHumanHandshake } from "./human-handshake";

const key = "synthetic-guest-handshake-key-at-least-32-bytes";
const secret = "synthetic-account-handshake-key-at-least-32-bytes";
const issued = issueGuestCookie(key);
const cookie = `incision.guest=${issued.value}`;
const now = () => 1_800_000_000_000;
const valid = (): GuestSessionRead => ({ kind: "valid", session: { id: issued.credential.id, expiresAt: new Date(now() + 30_000) } });
function options(overrides: Partial<Parameters<typeof authenticateHumanHandshake>[1]> = {}) {
  return { secret, guestKey: key, secureCookie: false, now, readVersion: vi.fn(async () => 1), readGuest: vi.fn(async () => valid()), ...overrides };
}

describe("human socket handshake", () => {
  it("does not create an identity for an anonymous socket", async () => {
    const deps = options();
    expect(await authenticateHumanHandshake(undefined, deps)).toEqual({ kind: "anonymous" });
    expect(deps.readGuest).not.toHaveBeenCalled();
    expect(deps.readVersion).not.toHaveBeenCalled();
  });

  it("verifies the signed proof with SQL and keeps only its server-side digest and deadline", async () => {
    const deps = options();
    expect(await authenticateHumanHandshake(cookie, deps)).toEqual({ kind: "guest", session: { proof: issued.credential, expiresAt: now() + 30_000 } });
    expect(deps.readGuest).toHaveBeenCalledExactlyOnceWith(issued.credential);
    expect(deps.readVersion).not.toHaveBeenCalled();
  });

  it.each(["incision.guest", "incision.guest=", "incision.guest=garbage", `${cookie}; ${cookie}`, `${cookie}X`])("rejects malformed/forged cookies before SQL: %s", async (header) => {
    const deps = options();
    expect(await authenticateHumanHandshake(header, deps)).toEqual({ kind: "refused", reason: "MALFORMED" });
    expect(deps.readGuest).not.toHaveBeenCalled();
  });

  it.each(["expired", "invalid"] as const)("rejects a %s SQL identity", async (kind) => {
    expect(await authenticateHumanHandshake(cookie, options({ readGuest: async () => ({ kind }) }))).toEqual({ kind: "refused", reason: kind === "expired" ? "EXPIRED" : "INVALID_TOKEN" });
  });

  it("rejects a deadline reached while SQL was awaited and a mismatched identity", async () => {
    expect(await authenticateHumanHandshake(cookie, options({ readGuest: async () => ({ kind: "valid", session: { id: issued.credential.id, expiresAt: new Date(now()) } }) }))).toEqual({ kind: "refused", reason: "EXPIRED" });
    expect(await authenticateHumanHandshake(cookie, options({ readGuest: async () => ({ kind: "valid", session: { id: "other", expiresAt: new Date(now() + 1) } }) }))).toEqual({ kind: "refused", reason: "CHECK_FAILED" });
  });

  it("fails closed on unavailable SQL, invalid dates or missing configuration", async () => {
    expect(await authenticateHumanHandshake(cookie, options({ readGuest: async () => { throw new Error("synthetic failure"); } }))).toEqual({ kind: "refused", reason: "CHECK_FAILED" });
    expect(await authenticateHumanHandshake(cookie, options({ readGuest: async () => ({ kind: "valid", session: { id: issued.credential.id, expiresAt: new Date(NaN) } }) }))).toEqual({ kind: "refused", reason: "CHECK_FAILED" });
    expect(await authenticateHumanHandshake(cookie, options({ guestKey: undefined }))).toEqual({ kind: "refused", reason: "NO_SECRET" });
  });

  it.each(["authjs.session-token=broken", "authjs.session-token.bad=broken", "__Secure-authjs.session-token=broken", "authjs.session-token"])("never falls back from a present account cookie: %s", async (account) => {
    const deps = options();
    expect(await authenticateHumanHandshake(`${account}; ${cookie}`, deps)).toMatchObject({ kind: "refused" });
    expect(deps.readGuest).not.toHaveBeenCalled();
  });

  it("gives a valid account priority even when a guest cookie is present", async () => {
    const deps = options();
    const name = "authjs.session-token";
    const token = await encode({ secret, salt: name, token: { sub: issued.credential.id, sessionVersion: 1, authTime: Math.floor(now() / 1000) } });
    expect(await authenticateHumanHandshake(`${name}=${token}; ${cookie}`, deps)).toMatchObject({ kind: "authenticated", session: { accountId: issued.credential.id } });
    expect(deps.readGuest).not.toHaveBeenCalled();
  });

  it("uses only the host-bound name in HTTPS", async () => {
    expect(await authenticateHumanHandshake(cookie, options({ secureCookie: true }))).toEqual({ kind: "anonymous" });
    expect(await authenticateHumanHandshake(`__Host-${cookie}`, options({ secureCookie: true }))).toMatchObject({ kind: "guest" });
  });
});
