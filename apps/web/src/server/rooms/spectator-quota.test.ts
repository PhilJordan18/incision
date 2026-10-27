import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { CodeAttemptLimiter } from "./code-attempt-limiter";
import { ROOM_CHANGE_LIMIT } from "./room-change-limiter";

const mocks = vi.hoisted(() => ({ join: vi.fn(), membership: vi.fn(), notify: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-incision-client-address": "203.0.113.33" }) }));
vi.mock("@/i18n/server", () => ({ getRequestLocale: async () => "en" }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect ${path}`); } }));
vi.mock("@/server/auth/session", () => ({ getAccountSession: async () => ({ accountId: "spectator" }), requireAccountSession: vi.fn() }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("./room-events", () => ({ notifyRoomChanged: mocks.notify }));
vi.mock("@incision/database", async (original) => ({
  ...(await original<typeof import("@incision/database")>()),
  findActiveMembership: mocks.membership,
  joinRoomByCode: mocks.join,
}));
const { joinRoomAction } = await import("./actions");
const { joinSpendsBudget } = await import("./code-attempts");
const { addressLimitKey } = await import("@/server/http/client-address");
const processGlobal = globalThis as typeof globalThis & { incisionCodeAttempts?: CodeAttemptLimiter; incisionRoomChanges?: AttemptLimiter };

beforeEach(() => {
  processGlobal.incisionCodeAttempts = new CodeAttemptLimiter();
  processGlobal.incisionRoomChanges = new AttemptLimiter(ROOM_CHANGE_LIMIT);
  mocks.membership.mockResolvedValue(undefined);
  mocks.join.mockResolvedValue({ ok: false, error: "SPECTATORS_FULL" });
});
afterEach(() => {
  delete processGlobal.incisionCodeAttempts;
  delete processGlobal.incisionRoomChanges;
  vi.clearAllMocks();
});
function form() {
  const input = new FormData();
  input.set("code", "ABCDEF");
  input.set("role", "spectator");
  input.set("accountId", "forged-host");
  return input;
}

it("returns the spectator refusal without notification or spending the failed-code budget", async () => {
  expect(await joinRoomAction({}, form())).toMatchObject({ error: "SPECTATORS_FULL", code: "ABCDEF" });
  expect(mocks.join).toHaveBeenCalledWith({}, { accountId: "spectator", code: "ABCDEF", role: "spectator" });
  expect(mocks.notify).not.toHaveBeenCalled();
  expect(joinSpendsBudget({ ok: false, error: "SPECTATORS_FULL" })).toBe(false);
  expect(processGlobal.incisionCodeAttempts?.isExhausted(addressLimitKey("203.0.113.33"))).toBe(false);
});

it("retains the account mutation budget for repeated full-quota requests", async () => {
  for (let index = 0; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
    expect(await joinRoomAction({}, form())).toMatchObject({ error: "SPECTATORS_FULL" });
  }
  expect(await joinRoomAction({}, form())).toMatchObject({ error: "RATE_LIMITED" });
  expect(mocks.join).toHaveBeenCalledTimes(ROOM_CHANGE_LIMIT.maxFailures);
  expect(processGlobal.incisionCodeAttempts?.isExhausted(addressLimitKey("203.0.113.33"))).toBe(false);
});

it("opens one's existing room without another admission or quota check", async () => {
  mocks.membership.mockResolvedValue({ lobbyId: "room", code: "ABCDEF", memberId: "member", isHost: false });
  await expect(joinRoomAction({}, form())).rejects.toThrow("redirect /rooms/ABCDEF");
  expect(mocks.join).not.toHaveBeenCalled();
  expect(mocks.notify).not.toHaveBeenCalled();
});
