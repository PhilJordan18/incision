import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ change: vi.fn(), session: vi.fn(), allow: vi.fn(), notify: vi.fn() }));
vi.mock("@incision/database", () => ({ changeRoomBots: mocks.change, describeDatabaseError: () => "unavailable" }));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: mocks.session }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("./room-change-limiter", () => ({ allowSettingsChange: mocks.allow }));
vi.mock("./room-events", () => ({ notifyRoomChanged: mocks.notify }));
import { changeRoomBotAction } from "./bot-actions";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "ABCDEF", revision: "1", kind: "add", level: "expert", accountId: "forged" })) data.set(key, value);
  return data;
}
beforeEach(() => {
  vi.resetAllMocks(); mocks.session.mockResolvedValue({ accountId: "real-session" }); mocks.allow.mockReturnValue(true);
  mocks.change.mockResolvedValue({ ok: true, lobbyId: "room", revision: 2 });
});
describe("authenticated bot actions", () => {
  it("takes identity only from the session and notifies only a committed success", async () => {
    expect(await changeRoomBotAction(form())).toEqual({ revision: 2 });
    expect(mocks.change).toHaveBeenCalledWith({}, { accountId: "real-session", code: "ABCDEF", revision: 1, change: { kind: "add", level: "expert" } });
    expect(mocks.notify).toHaveBeenCalledWith("room");
  });
  it("does not touch the database when session authentication fails", async () => {
    mocks.session.mockRejectedValue(new Error("sign-in redirect"));
    await expect(changeRoomBotAction(form())).rejects.toThrow("sign-in redirect");
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("validates before spending budget, then enforces that budget", async () => {
    expect(await changeRoomBotAction(new FormData())).toEqual({ error: "INVALID_BOT" });
    expect(mocks.allow).not.toHaveBeenCalled();
    mocks.allow.mockReturnValue(false);
    expect(await changeRoomBotAction(form())).toEqual({ error: "RATE_LIMITED" });
    expect(mocks.change).not.toHaveBeenCalled();
  });
  it("passes host refusal without broadcasting a fabricated change", async () => {
    mocks.change.mockResolvedValue({ ok: false, error: "NOT_HOST" });
    expect(await changeRoomBotAction(form())).toEqual({ error: "NOT_HOST" });
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("hides database failure details and never acknowledges an uncertain change", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.change.mockRejectedValue(new Error("internal data"));
    expect(await changeRoomBotAction(form())).toEqual({ error: "UNAVAILABLE" });
    expect(mocks.notify).not.toHaveBeenCalled(); log.mockRestore();
  });
});
