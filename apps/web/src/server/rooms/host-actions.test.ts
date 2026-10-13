import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { ROOM_CHANGE_LIMIT } from "./room-change-limiter";

// The host's actions without Next or a database: a signed-in account, the database answers mocked.
const startNextRound = vi.hoisted(() => vi.fn());
const closeRoom = vi.hoisted(() => vi.fn());
const notifyRoomChanged = vi.hoisted(() => vi.fn());
const notifyMemberLeft = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect ${path}`);
  },
}));
vi.mock("@/server/auth/session", () => ({ getAccountSession: async () => ({ accountId: "alice" }), requireAccountSession: async () => ({ accountId: "alice" }) }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("./room-events", () => ({ notifyRoomChanged, notifyMemberLeft }));
vi.mock("@incision/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@incision/database")>()),
  startNextRound,
  closeRoom,
}));

const { closeRoomAction, nextRoundAction } = await import("./actions");

const processGlobal = globalThis as typeof globalThis & { incisionRoomChanges?: AttemptLimiter };
const RACE = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function nextRound(raceId?: string) {
  const form = new FormData();
  if (raceId !== undefined) {
    form.set("raceId", raceId);
  }
  return nextRoundAction(form);
}

function close(code?: string) {
  const form = new FormData();
  if (code !== undefined) {
    form.set("code", code);
  }
  return closeRoomAction(form);
}

beforeEach(() => {
  processGlobal.incisionRoomChanges = new AttemptLimiter(ROOM_CHANGE_LIMIT);
});

afterEach(() => {
  delete processGlobal.incisionRoomChanges;
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("nextRoundAction", () => {
  it("refuses a missing or malformed race id before the database and the room-change budget", async () => {
    for (const bad of [undefined, "", "not-a-uuid"]) {
      expect(await nextRound(bad)).toEqual({ error: "NOT_ON_RESULTS" });
    }
    expect(startNextRound).not.toHaveBeenCalled();
    startNextRound.mockResolvedValue({ ok: true, lobbyId: "L", alreadyDone: false });
    for (let index = 0; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
      expect(await nextRound(RACE)).toEqual({});
    }
    expect(await nextRound(RACE)).toEqual({ error: "RATE_LIMITED" });
    expect(startNextRound).toHaveBeenCalledTimes(ROOM_CHANGE_LIMIT.maxFailures);
  });

  it("asks for the race in lower case, as PostgreSQL writes it", async () => {
    startNextRound.mockResolvedValue({ ok: true, lobbyId: "L", alreadyDone: false });
    await nextRound(RACE.toUpperCase());
    expect(startNextRound).toHaveBeenCalledWith(expect.anything(), { accountId: "alice", raceId: RACE });
  });

  it("tells the room's pages after a change, and again on a repeat in case the first telling was lost", async () => {
    startNextRound.mockResolvedValueOnce({ ok: true, lobbyId: "L", alreadyDone: false });
    expect(await nextRound(RACE)).toEqual({});
    startNextRound.mockResolvedValueOnce({ ok: true, lobbyId: "L", alreadyDone: true });
    expect(await nextRound(RACE)).toEqual({});
    expect(notifyRoomChanged.mock.calls).toEqual([["L"], ["L"]]);
  });

  it("passes the database's refusals on, tells nobody, and turns a failure into UNAVAILABLE", async () => {
    for (const error of ["NOT_HOST", "NOT_IN_A_ROOM", "NOT_ON_RESULTS"]) {
      startNextRound.mockResolvedValueOnce({ ok: false, error });
      expect(await nextRound(RACE)).toEqual({ error });
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    startNextRound.mockRejectedValueOnce(new Error("connection lost"));
    expect(await nextRound(RACE)).toEqual({ error: "UNAVAILABLE" });
    expect(notifyRoomChanged).not.toHaveBeenCalled();
  });
});

describe("closeRoomAction", () => {
  it("closes the room the page names only, and refuses a malformed code before the budget", async () => {
    for (const bad of [undefined, "", "not a code"]) {
      expect(await close(bad)).toEqual({ error: "NOT_IN_A_ROOM" });
    }
    expect(closeRoom).not.toHaveBeenCalled();
    // The refused codes spent nothing: the whole budget is still there.
    closeRoom.mockResolvedValue({ ok: true, lobbyId: "L" });
    for (let index = 0; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
      expect(await close("ABCDEF")).toEqual({});
    }
    expect(await close("ABCDEF")).toEqual({ error: "RATE_LIMITED" });
    expect(closeRoom).toHaveBeenCalledWith(expect.anything(), { accountId: "alice", code: "ABCDEF" });
  });

  it("closes the room by its canonical code, however the page wrote it", async () => {
    closeRoom.mockResolvedValue({ ok: true, lobbyId: "L" });
    expect(await close(" abcdef ")).toEqual({});
    expect(closeRoom).toHaveBeenCalledWith(expect.anything(), { accountId: "alice", code: "ABCDEF" });
  });

  it("ends the room's race state for its members, then tells the room's pages", async () => {
    closeRoom.mockResolvedValueOnce({ ok: true, lobbyId: "L" });
    expect(await close("ABCDEF")).toEqual({});
    expect(notifyMemberLeft).toHaveBeenCalledWith("L", "alice", true);
    expect(notifyRoomChanged).toHaveBeenCalledWith("L");
    expect(notifyMemberLeft.mock.invocationCallOrder[0]).toBeLessThan(notifyRoomChanged.mock.invocationCallOrder[0] ?? 0);
  });

  it("passes the refusals on and tells nobody; shares the room-change budget with the next round", async () => {
    for (const error of ["NOT_HOST", "NOT_IN_A_ROOM", "ROOM_RACING"]) {
      closeRoom.mockResolvedValueOnce({ ok: false, error });
      expect(await close("ABCDEF")).toEqual({ error });
    }
    expect(notifyMemberLeft).not.toHaveBeenCalled();
    expect(notifyRoomChanged).not.toHaveBeenCalled();
    startNextRound.mockResolvedValue({ ok: false, error: "NOT_ON_RESULTS" });
    for (let index = 3; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
      await nextRound(RACE);
    }
    expect(await close("ABCDEF")).toEqual({ error: "RATE_LIMITED" });
    expect(closeRoom).toHaveBeenCalledTimes(3);
  });
});
