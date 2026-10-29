import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { ROOM_CHANGE_LIMIT, SETTINGS_CHANGE_LIMIT } from "./room-change-limiter";

// The host's actions without Next or a database: a signed-in account, the database answers mocked.
const startNextRound = vi.hoisted(() => vi.fn());
const closeRoom = vi.hoisted(() => vi.fn());
const configureRoom = vi.hoisted(() => vi.fn());
const notifyRoomChanged = vi.hoisted(() => vi.fn());
const notifyMemberLeft = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/i18n/server", () => ({ getRequestLocale: async () => "en" }));
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
  configureRoom,
}));

const { closeRoomAction, configureRoomAction, nextRoundAction } = await import("./actions");

const processGlobal = globalThis as typeof globalThis & { incisionRoomChanges?: AttemptLimiter; incisionSettingsChanges?: AttemptLimiter };
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

function configure(fields: Readonly<Record<string, string>> = {}) {
  const form = new FormData();
  for (const [name, value] of Object.entries({ code: "ABCDEF", revision: "2", textLanguage: "en", wordCount: "50", timeLimitSeconds: "60", errorMode: "mandatory", ...fields })) {
    form.set(name, value);
  }
  return configureRoomAction(form);
}

beforeEach(() => {
  processGlobal.incisionRoomChanges = new AttemptLimiter(ROOM_CHANGE_LIMIT);
  processGlobal.incisionSettingsChanges = new AttemptLimiter(SETTINGS_CHANGE_LIMIT);
});

afterEach(() => {
  delete processGlobal.incisionRoomChanges;
  delete processGlobal.incisionSettingsChanges;
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

describe("configureRoomAction", () => {
  it("saves free typing using the session identity, not a client-supplied identity", async () => {
    configureRoom.mockResolvedValueOnce({ ok: true, lobbyId: "L", revision: 3 });
    expect(await configure({ errorMode: "free", accountId: "forged" })).toEqual({ revision: 3 });
    expect(configureRoom).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      accountId: "alice", code: "ABCDEF", revision: 2,
      settings: { textLanguage: "en", wordCount: 50, timeLimitMs: 60_000, errorMode: "free" },
    });
  });
  it("saves the settings the form names for the session's account, tells the room's pages, and answers the new revision", async () => {
    configureRoom.mockResolvedValueOnce({ ok: true, lobbyId: "L", revision: 3 });
    expect(await configure({ code: " abcdef " })).toEqual({ revision: 3 });
    expect(configureRoom).toHaveBeenCalledExactlyOnceWith(expect.anything(), {
      accountId: "alice",
      code: "ABCDEF",
      revision: 2,
      settings: { textLanguage: "en", wordCount: 50, timeLimitMs: 60_000, errorMode: "mandatory" },
    });
    expect(notifyRoomChanged).toHaveBeenCalledExactlyOnceWith("L");
    expect(notifyMemberLeft).not.toHaveBeenCalled();
  });

  it.each(["none", "30", "121", "600"])("saves the supported duration %s through the authenticated host transaction", async (seconds) => {
    configureRoom.mockResolvedValue({ ok: true, lobbyId: "L", revision: 3 });
    expect(await configure({ timeLimitSeconds: seconds })).toEqual({ revision: 3 });
    expect(configureRoom).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      settings: { textLanguage: "en", wordCount: 50, timeLimitMs: seconds === "none" ? null : Number(seconds) * 1000, errorMode: "mandatory" },
    }));
    expect(notifyRoomChanged).toHaveBeenCalledExactlyOnceWith("L");
  });

  it("refuses malformed or out-of-range settings before the budget and the database", async () => {
    const malformed: Readonly<Record<string, string>>[] = [{ code: "" }, { revision: "-1" }, { textLanguage: "de" }, { timeLimitSeconds: "601" }, { timeLimitSeconds: "null" }, { errorMode: "unknown" }];
    for (const fields of malformed) {
      expect(await configure(fields), JSON.stringify(fields)).toEqual({ error: "INVALID_SETTINGS" });
    }
    expect(configureRoom).not.toHaveBeenCalled();
    // The refused forms spent nothing: the whole budget is still there.
    configureRoom.mockResolvedValue({ ok: true, lobbyId: "L", revision: 3 });
    for (let index = 0; index < SETTINGS_CHANGE_LIMIT.maxFailures; index += 1) {
      expect(await configure()).toEqual({ revision: 3 });
    }
    expect(await configure()).toEqual({ error: "RATE_LIMITED" });
    expect(configureRoom).toHaveBeenCalledTimes(SETTINGS_CHANGE_LIMIT.maxFailures);
  });

  it("passes the database's refusals on and tells nobody; turns a failure into UNAVAILABLE", async () => {
    for (const error of ["NOT_HOST", "NOT_IN_A_ROOM", "ROOM_NOT_WAITING", "STALE_REVISION"]) {
      configureRoom.mockResolvedValueOnce({ ok: false, error });
      expect(await configure()).toEqual({ error });
    }
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    configureRoom.mockRejectedValueOnce(new Error("connection lost"));
    expect(await configure()).toEqual({ error: "UNAVAILABLE" });
    expect(notifyRoomChanged).not.toHaveBeenCalled();
  });

  it("counts its saves apart from the room changes, refused ones included", async () => {
    configureRoom.mockResolvedValue({ ok: false, error: "STALE_REVISION" });
    for (let index = 0; index < SETTINGS_CHANGE_LIMIT.maxFailures; index += 1) {
      await configure();
    }
    expect(await configure()).toEqual({ error: "RATE_LIMITED" });
    // Closing the room still has its whole budget...
    closeRoom.mockResolvedValue({ ok: true, lobbyId: "L" });
    expect(await close("ABCDEF")).toEqual({});
    // ...and spending the room changes leaves the settings budget alone.
    processGlobal.incisionSettingsChanges = new AttemptLimiter(SETTINGS_CHANGE_LIMIT);
    for (let index = 1; index < ROOM_CHANGE_LIMIT.maxFailures; index += 1) {
      await close("ABCDEF");
    }
    expect(await close("ABCDEF")).toEqual({ error: "RATE_LIMITED" });
    configureRoom.mockResolvedValueOnce({ ok: true, lobbyId: "L", revision: 1 });
    expect(await configure()).toEqual({ revision: 1 });
  });
});
