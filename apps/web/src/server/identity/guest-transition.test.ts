import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueGuestCookie } from "./guest-cookie";
import { guestPresenceBlocksSignIn } from "./guest-transition";

const mocks = vi.hoisted(() => ({ header: "", read: vi.fn(), membership: vi.fn(), prepare: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ cookie: mocks.header }) }));
vi.mock("../auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("../config", () => ({ parseServerEnv: () => ({ secureCookies: false }) }));
vi.mock("@incision/database", () => ({
  prepareGuestAccountSignIn: (...args: unknown[]) => mocks.prepare(...args),
  readGuestSession: (...args: unknown[]) => mocks.read(...args),
  findActiveHumanMembership: (...args: unknown[]) => mocks.membership(...args),
}));
const key = "guest-transition-synthetic-key-for-tests-only";
beforeEach(() => {
  vi.stubEnv("GUEST_SESSION_SECRET", key);
  mocks.header = "";
  mocks.prepare.mockReset().mockResolvedValue(true);
  mocks.read.mockReset().mockResolvedValue({ kind: "valid" });
  mocks.membership.mockReset().mockResolvedValue({ memberId: "synthetic" });
});

describe("guest/account transition", () => {
  it("does not query SQL for an absent or forged guest cookie", async () => {
    expect(await guestPresenceBlocksSignIn()).toBe(false);
    mocks.header = "incision.guest=forged";
    expect(await guestPresenceBlocksSignIn()).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["", "; authjs.session-token=untrusted", "; authjs.session-token.bad=untrusted"])("blocks active presence regardless of account cookie %s", async (suffix) => {
    const cookie = issueGuestCookie(key);
    mocks.header = `incision.guest=${cookie.value}${suffix}`;
    expect(await guestPresenceBlocksSignIn()).toBe(true);
    expect(mocks.read).toHaveBeenCalledWith({}, cookie.credential);
    expect(mocks.membership).toHaveBeenCalledWith({}, { kind: "guest", guestSessionId: cookie.credential.id });
  });
  it.each(["invalid", "expired"])("allows login after %s identity without reading membership", async (kind) => {
    mocks.header = `incision.guest=${issueGuestCookie(key).value}`;
    mocks.read.mockResolvedValue({ kind });
    expect(await guestPresenceBlocksSignIn()).toBe(false);
    expect(mocks.membership).not.toHaveBeenCalled();
  });
  it("allows login after explicit departure, without transferring anything", async () => {
    mocks.header = `incision.guest=${issueGuestCookie(key).value}`;
    mocks.membership.mockResolvedValue(undefined);
    expect(await guestPresenceBlocksSignIn()).toBe(false);
  });
  it("uses the transactional admission fence at the final authentication callback", async () => {
    const cookie = issueGuestCookie(key); mocks.header = `incision.guest=${cookie.value}`;
    mocks.prepare.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    expect(await guestPresenceBlocksSignIn(true)).toBe(true);
    expect(await guestPresenceBlocksSignIn(true)).toBe(false);
    expect(mocks.prepare).toHaveBeenCalledWith({}, cookie.credential);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("propagates database failure instead of allowing login", async () => {
    mocks.header = `incision.guest=${issueGuestCookie(key).value}`;
    mocks.read.mockRejectedValue(new Error("synthetic outage"));
    await expect(guestPresenceBlocksSignIn()).rejects.toThrow("synthetic outage");
  });
});
