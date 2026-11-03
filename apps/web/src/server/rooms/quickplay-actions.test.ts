import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  account: vi.fn(), guestPlay: vi.fn(), session: vi.fn(), guest: vi.fn(), cookie: vi.fn(), allow: vi.fn(), forgive: vi.fn(), notify: vi.fn(), enabled: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect ${path}`); } }));
vi.mock("@incision/database", () => ({ quickplayAccount: mocks.account, quickplayGuest: mocks.guestPlay, describeDatabaseError: () => "db" }));
vi.mock("../auth/session", () => ({ getAccountSession: mocks.session }));
vi.mock("../auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("../identity/guest-entry-switch", () => ({ guestEntryEnabled: mocks.enabled }));
vi.mock("../identity/guest-request", () => ({ requestGuest: mocks.guest, refreshGuestActionCookie: mocks.cookie }));
vi.mock("./room-change-limiter", () => ({ allowRoomChange: mocks.allow, forgiveRoomChange: mocks.forgive }));
vi.mock("./room-events", () => ({ notifyRoomChanged: mocks.notify }));
import { guestQuickplayAction, quickplayAction } from "./quickplay-actions";

function nickname(value = "Léa") { const data = new FormData(); data.set("nickname", value); data.set("code", "FORGED"); data.set("role", "spectator"); return data; }

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mocks.session.mockResolvedValue({ accountId: "real" }); mocks.allow.mockReturnValue(true); mocks.enabled.mockReturnValue(true);
  mocks.guest.mockResolvedValue({ proof: { id: "guest", secretDigest: "d" } });
});

describe("quickplayAction (JOIN-03)", () => {
  it("sends a visitor without an account to the guest quickplay entry, before any lookup", async () => {
    mocks.session.mockResolvedValue(null);
    await expect(quickplayAction()).rejects.toThrow("redirect /guest?quickplay=1");
    expect(mocks.account).not.toHaveBeenCalled(); expect(mocks.allow).not.toHaveBeenCalled();
  });
  it("admits the session's account and goes to the room, announcing only a new member", async () => {
    mocks.account.mockResolvedValue({ ok: true, lobbyId: "room", memberId: "m", alreadyMember: false, code: "ABCDEF" });
    await expect(quickplayAction()).rejects.toThrow("redirect /rooms/ABCDEF");
    expect(mocks.account).toHaveBeenCalledWith({}, "real");
    expect(mocks.allow).toHaveBeenCalledWith("real"); expect(mocks.notify).toHaveBeenCalledWith("room");
  });
  it("offers creation without creating anything, and keeps the current room", async () => {
    mocks.account.mockResolvedValue({ ok: false, error: "NO_ROOM" });
    expect(await quickplayAction()).toEqual({ error: "NO_ROOM" });
    expect(mocks.forgive).not.toHaveBeenCalled();
    mocks.account.mockResolvedValue({ ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: "BBBBBB" });
    expect(await quickplayAction()).toEqual({ error: "ALREADY_IN_ANOTHER_ROOM", currentCode: "BBBBBB" });
    // Nothing changed for a member of another room: the attempt is given back.
    expect(mocks.forgive).toHaveBeenCalledExactlyOnceWith("real");
    mocks.account.mockResolvedValue({ ok: false, error: "ACCOUNT_NOT_FOUND" });
    expect(await quickplayAction()).toEqual({ error: "UNAVAILABLE" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("is limited like any room change and hides database errors", async () => {
    mocks.allow.mockReturnValueOnce(false);
    expect(await quickplayAction()).toEqual({ error: "RATE_LIMITED" }); expect(mocks.account).not.toHaveBeenCalled();
    mocks.account.mockRejectedValue(new Error("secret detail"));
    expect(await quickplayAction()).toEqual({ error: "UNAVAILABLE" });
  });
});

describe("guestQuickplayAction (JOIN-03)", () => {
  it("uses only the verified guest proof and the nickname; never a code or a spectator role from the form", async () => {
    mocks.guestPlay.mockResolvedValue({ ok: true, lobbyId: "room", memberId: "m", alreadyMember: false, code: "ABCDEF", guestSession: { id: "guest" } });
    expect(await guestQuickplayAction(nickname())).toEqual({ code: "ABCDEF" });
    expect(mocks.guestPlay).toHaveBeenCalledWith({}, { proof: { id: "guest", secretDigest: "d" }, nickname: "Léa" });
    expect(mocks.allow).toHaveBeenCalledWith("guest:guest"); expect(mocks.cookie).toHaveBeenCalledOnce(); expect(mocks.notify).toHaveBeenCalledWith("room");
  });
  it("refuses before any lookup: switch off, bad nickname, no guest, rate limit", async () => {
    mocks.enabled.mockReturnValueOnce(false);
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "UNAVAILABLE" });
    expect(await guestQuickplayAction(nickname("x"))).toEqual({ error: "INVALID_GUEST_NICKNAME" });
    expect(await guestQuickplayAction({ nickname: "Mousse" } as unknown as FormData)).toEqual({ error: "INVALID_GUEST_NICKNAME" });
    mocks.guest.mockResolvedValueOnce(undefined);
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "UNAUTHORIZED" });
    mocks.allow.mockReturnValueOnce(false);
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.guestPlay).not.toHaveBeenCalled();
  });
  it("shows the empty state, maps an ended session and never renews on a refusal", async () => {
    mocks.guestPlay.mockResolvedValue({ ok: false, error: "NO_ROOM" });
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "NO_ROOM" });
    mocks.guestPlay.mockResolvedValue({ ok: false, error: "INVALID_GUEST_SESSION" });
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "UNAUTHORIZED" });
    mocks.guestPlay.mockResolvedValue({ ok: false, error: "NICKNAME_TAKEN" });
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "NICKNAME_TAKEN" });
    mocks.guestPlay.mockRejectedValue(new Error("secret detail"));
    expect(await guestQuickplayAction(nickname())).toEqual({ error: "UNAVAILABLE" });
    expect(mocks.cookie).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
  });
});
