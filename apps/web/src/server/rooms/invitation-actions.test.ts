import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ identity: vi.fn(), create: vi.fn(), revoke: vi.fn(), list: vi.fn(), join: vi.fn(), member: vi.fn(), allow: vi.fn(), notify: vi.fn(), refresh: vi.fn(), attempt: vi.fn() }));
vi.mock("@incision/database", () => ({ createRoomInvitation: mocks.create, revokeRoomInvitation: mocks.revoke,
  listRoomInvitations: mocks.list, joinRoomByInvitation: mocks.join, findActiveHumanMembership: mocks.member }));
vi.mock("./invitation-actor", () => ({ invitationActor: mocks.identity }));
vi.mock("../auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("../identity/guest-request", () => ({ refreshGuestActionCookie: mocks.refresh }));
vi.mock("./room-change-limiter", () => ({ allowRoomChange: mocks.allow, allowSettingsChange: mocks.allow }));
vi.mock("./room-events", () => ({ notifyRoomChanged: mocks.notify }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-incision-client-address": "192.0.2.1" }) }));
vi.mock("./code-attempts", () => ({ requestAddressKey: async () => "192.0.2.1", codeAttempts: () => ({ attempt: mocks.attempt }) }));
import { createInvitationAction, revokeInvitationAction, listInvitationsAction, joinInvitationAction } from "./invitation-actions";
import { issueInvitationToken } from "./invitation-credentials";

function form(values: Record<string, string> = {}) {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "ABCDEF", page: "0", ...values })) data.set(key, value);
  return data;
}
afterEach(() => vi.unstubAllEnvs());
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("INVITATION_IP_SECRET", "test-only-invitation-key-not-production-1234");
  mocks.identity.mockResolvedValue({ actor: { accountId: "verified" }, key: "account:verified" });
  mocks.allow.mockReturnValue(true);
  mocks.create.mockResolvedValue({ ok: true, lobbyId: "room", invitationId: "id" });
  mocks.revoke.mockResolvedValue({ ok: true, lobbyId: "room" });
  mocks.list.mockResolvedValue({ ok: true, items: [], hasMore: false });
  mocks.join.mockResolvedValue({ ok: true, lobbyId: "room", alreadyMember: false });
  mocks.member.mockResolvedValue({ lobbyId: "room", code: "ABCDEF" });
  mocks.attempt.mockImplementation(async (_key, operation) => ({ ok: true, value: await operation() }));
});

describe("invitation server boundaries", () => {
  it("returns the secret only as a fresh fragment link and stores only its digest", async () => {
    const result = await createInvitationAction(form({ accountId: "forged" }));
    expect(result).toMatchObject({ path: expect.stringMatching(/^\/invite#[A-Za-z0-9_-]{43}$/) });
    expect(mocks.create).toHaveBeenCalledWith({}, { accountId: "verified", code: "ABCDEF", tokenDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(mocks.notify).toHaveBeenCalledWith("room");
  });
  it("refuses anonymous callers before persistence", async () => {
    mocks.identity.mockResolvedValue(undefined);
    expect(await createInvitationAction(form())).toEqual({ error: "INVITATION_UNAVAILABLE" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not issue unusable links without the server key", async () => {
    vi.stubEnv("INVITATION_IP_SECRET", "");
    expect(await createInvitationAction(form())).toEqual({ error: "UNAVAILABLE" });
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects duplicate input before spending rate budget", async () => {
    const data = form(); data.append("code", "ZZZZZZ");
    expect(await createInvitationAction(data)).toEqual({ error: "INVITATION_UNAVAILABLE" });
    expect(mocks.allow).not.toHaveBeenCalled();
  });
  it("honors rate limits and host refusal without broadcasting", async () => {
    mocks.allow.mockReturnValue(false);
    expect(await createInvitationAction(form())).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.create).not.toHaveBeenCalled();
    mocks.allow.mockReturnValue(true); mocks.create.mockResolvedValue({ ok: false });
    expect(await createInvitationAction(form())).toEqual({ error: "INVITATION_UNAVAILABLE" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("validates revoke IDs and list pagination", async () => {
    expect(await revokeInvitationAction(form({ invitationId: "bad" }))).toEqual({ error: "INVITATION_UNAVAILABLE" });
    expect(await listInvitationsAction(form({ page: "-1" }))).toEqual({ error: "INVITATION_UNAVAILABLE" });
    expect(mocks.revoke).not.toHaveBeenCalled(); expect(mocks.list).not.toHaveBeenCalled();
  });
  it("derives the account and trusted full-IP hash on admission", async () => {
    const { token, digest } = issueInvitationToken();
    expect(await joinInvitationAction(form({ token, role: "participant", accountId: "forged", address: "forged" }))).toEqual({ code: "ABCDEF" });
    const input = mocks.join.mock.calls[0]![1];
    expect(input).toMatchObject({ tokenDigest: digest, actor: { kind: "account", accountId: "verified" } });
    expect(input.addressDigestForRoom("room")).toMatch(/^[a-f0-9]{64}$/);
  });
  it("does not renew a guest session on admission refusal", async () => {
    mocks.identity.mockResolvedValue({ actor: { accountId: null, guestProof: { id: "guest", secretDigest: "proof" } }, key: "guest:guest", guest: {} });
    mocks.join.mockResolvedValue({ ok: false, error: "ROOM_FULL" });
    expect(await joinInvitationAction(form({ token: issueInvitationToken().token, role: "participant", nickname: "Sailor" }))).toEqual({ error: "ROOM_FULL" });
    expect(mocks.refresh).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("hides database failure details without logging a bearer token", async () => {
    mocks.create.mockRejectedValue(new Error("secret query"));
    const log = vi.spyOn(console, "error");
    expect(await createInvitationAction(form())).toEqual({ error: "UNAVAILABLE" });
    expect(log).not.toHaveBeenCalled(); log.mockRestore();
  });
});
