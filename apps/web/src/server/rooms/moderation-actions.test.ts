import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ expel: vi.fn(), session: vi.fn(), guest: vi.fn(), cookie: vi.fn(), allow: vi.fn(), events: [] as string[] }));
vi.mock("@incision/database", () => ({ expelRoomMember: mocks.expel }));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("@/server/identity/guest-request", () => ({ requestGuest: mocks.guest, refreshGuestActionCookie: mocks.cookie }));
vi.mock("./room-change-limiter", () => ({ allowSettingsChange: mocks.allow }));
vi.mock("./room-events", () => ({
  notifyMemberExpelled: () => mocks.events.push("evict"), notifyRoomChanged: () => mocks.events.push("changed"),
  notifyMemberLeft: () => mocks.events.push("accountLeft"), notifyGuestLeft: () => mocks.events.push("guestLeft"),
}));
import { expelMemberAction, guestExpelMemberAction } from "./moderation-actions";
const memberId = "abcdefab-1234-4567-89ab-abcdefabcdef";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "ABCDEF", revision: "1", memberId, accountId: "forged" })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.events.length = 0;
  mocks.session.mockResolvedValue({ accountId: "real" }); mocks.allow.mockReturnValue(true);
  mocks.guest.mockResolvedValue({ proof: { id: "guest" } });
  mocks.expel.mockResolvedValue({ ok: true, lobbyId: "room", memberId, revision: 2, subject: { kind: "account", accountId: "target" } });
});
describe("moderation action boundary", () => {
  it("uses authenticated identity and evicts before race departure and broadcast", async () => {
    expect(await expelMemberAction(form())).toEqual({ revision: 2 });
    expect(mocks.expel).toHaveBeenCalledWith({}, { accountId: "real", code: "ABCDEF", revision: 1, memberId });
    expect(mocks.events).toEqual(["evict", "accountLeft", "changed"]);
  });
  it("uses guest proof and emits a guest departure, not a surrogate account", async () => {
    mocks.expel.mockResolvedValue({ ok: true, lobbyId: "room", memberId, revision: 2, subject: { kind: "guest", guestSessionId: "target" }, guestSession: { id: "guest" } });
    expect(await guestExpelMemberAction(form())).toEqual({ revision: 2 });
    expect(mocks.expel).toHaveBeenCalledWith({}, { accountId: null, guestProof: { id: "guest" }, code: "ABCDEF", revision: 1, memberId });
    expect(mocks.events).toEqual(["evict", "guestLeft", "changed"]);
    expect(mocks.cookie).toHaveBeenCalledOnce();
  });
  it("does not mutate without authenticated presence", async () => {
    mocks.session.mockRejectedValue(new Error("redirect"));
    await expect(expelMemberAction(form())).rejects.toThrow("redirect");
    mocks.guest.mockResolvedValue(undefined);
    expect(await guestExpelMemberAction(form())).toEqual({ error: "NOT_IN_A_ROOM" });
    expect(mocks.expel).not.toHaveBeenCalled();
  });
  it.each([expelMemberAction, guestExpelMemberAction])("rejects invalid, limited, refused and failed requests without events", async (action) => {
    expect(await action(new FormData())).toEqual({ error: "INVALID_TARGET" });
    expect(mocks.allow).not.toHaveBeenCalled();
    mocks.allow.mockReturnValueOnce(false);
    expect(await action(form())).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.expel).not.toHaveBeenCalled();
    mocks.expel.mockResolvedValueOnce({ ok: false, error: "NOT_HOST" });
    expect(await action(form())).toEqual({ error: "NOT_HOST" });
    mocks.expel.mockRejectedValueOnce(new Error("private failure"));
    expect(await action(form())).toEqual({ error: "UNAVAILABLE" });
    expect(mocks.events).toEqual([]); expect(mocks.cookie).not.toHaveBeenCalled();
  });
});
