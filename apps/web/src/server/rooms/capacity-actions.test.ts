import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ change: vi.fn(), session: vi.fn(), guest: vi.fn(), cookie: vi.fn(), allow: vi.fn(), notify: vi.fn() }));
vi.mock("@incision/database", () => ({ changeRoomCapacity: mocks.change }));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("@/server/identity/guest-request", () => ({ requestGuest: mocks.guest, refreshGuestActionCookie: mocks.cookie }));
vi.mock("./room-change-limiter", () => ({ allowSettingsChange: mocks.allow }));
vi.mock("./room-events", () => ({ notifyRoomChanged: mocks.notify }));
import { changeCapacityAction, guestChangeCapacityAction } from "./capacity-actions";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "ABCDEF", revision: "1", capacity: "20", accountId: "forged" })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ accountId: "real" }); mocks.allow.mockReturnValue(true);
  mocks.guest.mockResolvedValue({ proof: { id: "guest" } }); mocks.change.mockResolvedValue({ ok: true, lobbyId: "room", revision: 2 });
});
describe("capacity actions", () => {
  it("takes the account from the verified session", async () => {
    expect(await changeCapacityAction(form())).toEqual({ revision: 2 });
    expect(mocks.change).toHaveBeenCalledWith({}, { accountId: "real", code: "ABCDEF", revision: 1, capacity: 20 });
    expect(mocks.notify).toHaveBeenCalledWith("room");
  });
  it("preserves the unauthenticated redirect", async () => {
    mocks.session.mockRejectedValue(new Error("redirect"));
    await expect(changeCapacityAction(form())).rejects.toThrow("redirect"); expect(mocks.change).not.toHaveBeenCalled();
  });
  it("requires a guest proof and renews only an accepted guest action", async () => {
    mocks.guest.mockResolvedValueOnce(undefined);
    expect(await guestChangeCapacityAction(form())).toEqual({ error: "NOT_IN_A_ROOM" });
    expect(mocks.change).not.toHaveBeenCalled();
    mocks.change.mockResolvedValue({ ok: true, lobbyId: "room", revision: 2, guestSession: { id: "guest" } });
    expect(await guestChangeCapacityAction(form())).toEqual({ revision: 2 });
    expect(mocks.change).toHaveBeenCalledWith({}, { accountId: null, guestProof: { id: "guest" }, code: "ABCDEF", revision: 1, capacity: 20 });
    expect(mocks.cookie).toHaveBeenCalledOnce();
  });
  it.each([changeCapacityAction, guestChangeCapacityAction])("validates, limits and refuses without announcing success", async (action) => {
    expect(await action(new FormData())).toEqual({ error: "INVALID_CAPACITY" });
    expect(mocks.allow).not.toHaveBeenCalled();
    mocks.allow.mockReturnValueOnce(false);
    expect(await action(form())).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.change).not.toHaveBeenCalled();
    mocks.change.mockResolvedValue({ ok: false, error: "NOT_HOST" });
    expect(await action(form())).toEqual({ error: "NOT_HOST" });
    expect(mocks.notify).not.toHaveBeenCalled(); expect(mocks.cookie).not.toHaveBeenCalled();
    mocks.change.mockRejectedValue(new Error("private data"));
    expect(await action(form())).toEqual({ error: "UNAVAILABLE" });
  });
});
