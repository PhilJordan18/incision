import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { CODE_ATTEMPT_LIMITS, CodeAttemptLimiter } from "./code-attempt-limiter";
import { ROOM_CHANGE_LIMIT } from "./room-change-limiter";

// The join action without Next or a database: a signed-in account, from one address.
const joinRoomByCode = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-incision-client-address": "203.0.113.1" }) }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
}));
vi.mock("@/server/auth/session", () => ({ getAccountSession: async () => ({ accountId: "alice" }), requireAccountSession: vi.fn() }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("./room-events", () => ({ notifyRoomChanged: vi.fn() }));
vi.mock("@incision/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@incision/database")>()),
  findActiveMembership: async () => undefined,
  joinRoomByCode,
}));

const { joinRoomAction } = await import("./actions");

const processGlobal = globalThis as typeof globalThis & { incisionCodeAttempts?: CodeAttemptLimiter; incisionRoomChanges?: AttemptLimiter };

function join(code = "ZZZZZZ") {
  const form = new FormData();
  form.set("code", code);
  return joinRoomAction({}, form);
}

beforeEach(() => {
  processGlobal.incisionRoomChanges = new AttemptLimiter(ROOM_CHANGE_LIMIT);
});

afterEach(() => {
  delete processGlobal.incisionCodeAttempts;
  delete processGlobal.incisionRoomChanges;
  joinRoomByCode.mockReset();
});

describe("joinRoomAction and the room-change limit", () => {
  it("gives the room change back when the code limit refuses before any lookup", async () => {
    // No address can be remembered: every attempt is refused CODE_BUSY before its lookup.
    processGlobal.incisionCodeAttempts = new CodeAttemptLimiter({ ...CODE_ATTEMPT_LIMITS, maxAddresses: 0 });
    for (let index = 0; index < ROOM_CHANGE_LIMIT.maxFailures + 5; index += 1) {
      expect(await join()).toMatchObject({ error: "CODE_BUSY" });
    }
    expect(joinRoomByCode).not.toHaveBeenCalled();
  });

  it("keeps counting the joins that ran, whatever their answer", async () => {
    processGlobal.incisionCodeAttempts = new CodeAttemptLimiter();
    joinRoomByCode.mockResolvedValue({ ok: false, error: "ROOM_FULL" });
    for (let index = 0; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
      expect(await join()).toMatchObject({ error: "ROOM_FULL" });
    }
    expect(await join()).toMatchObject({ error: "RATE_LIMITED" });
    expect(joinRoomByCode).toHaveBeenCalledTimes(ROOM_CHANGE_LIMIT.maxFailures);
  });
});
