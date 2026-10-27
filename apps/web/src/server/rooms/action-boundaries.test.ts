import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { roomPresence } from "@/server/realtime/room-presence";

// Exercise the exported server actions directly: rendering a protected page is not an
// authorization boundary. Database stubs expose any call made before the session guard.
const boundary = vi.hoisted(() => ({
  requireSession: vi.fn(),
  database: vi.fn(() => ({})),
  create: vi.fn(),
  leave: vi.fn(),
  next: vi.fn(),
  close: vi.fn(),
  configure: vi.fn(),
  changed: vi.fn(),
  left: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/i18n/server", () => ({ getRequestLocale: async () => "en" }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error(`redirect ${path}`); } }));
vi.mock("@/server/auth/session", () => ({ requireAccountSession: boundary.requireSession, getAccountSession: vi.fn() }));
vi.mock("@/server/auth/store", () => ({ authDatabase: boundary.database }));
vi.mock("./room-events", () => ({ notifyRoomChanged: boundary.changed, notifyMemberLeft: boundary.left }));
vi.mock("@incision/database", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@incision/database")>()),
  createRoomWithHost: boundary.create,
  leaveCurrentRoom: boundary.leave,
  startNextRound: boundary.next,
  closeRoom: boundary.close,
  configureRoom: boundary.configure,
}));

const { createRoomAction, leaveRoomAction, nextRoundAction, closeRoomAction, configureRoomAction } = await import("./actions");
const processGlobal = globalThis as typeof globalThis & { incisionRoomChanges?: unknown; incisionSettingsChanges?: unknown };
const RACE = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function form(): FormData {
  const value = new FormData();
  value.set("code", "ABCDEF");
  value.set("raceId", RACE);
  value.set("accountId", "forged-host");
  value.set("hostMemberId", "forged-member");
  value.set("revision", "0");
  // The text language of the settings form; a new room's comes from the request instead (mocked "en").
  value.set("textLanguage", "fr");
  value.set("timeLimitSeconds", "60");
  return value;
}

beforeEach(() => {
  vi.resetAllMocks();
  delete processGlobal.incisionRoomChanges;
  delete processGlobal.incisionSettingsChanges;
  boundary.requireSession.mockResolvedValue({ accountId: "session-account" });
});
afterEach(() => {
  delete processGlobal.incisionRoomChanges;
  delete processGlobal.incisionSettingsChanges;
});

const guardedActions = [
  { name: "create", invoke: (data: FormData) => createRoomAction({}, data) },
  { name: "leave", invoke: (data: FormData) => leaveRoomAction({}, data) },
  { name: "next round", invoke: nextRoundAction },
  { name: "close", invoke: closeRoomAction },
  { name: "configure", invoke: configureRoomAction },
];

describe("server-action identity boundaries (SEC-01)", () => {
  it.each(guardedActions)("$name cannot mutate or announce anything without a session", async ({ invoke }) => {
    boundary.requireSession.mockRejectedValue(new Error("redirect /sign-in"));
    await expect(invoke(form())).rejects.toThrow("redirect /sign-in");
    expect(boundary.database).not.toHaveBeenCalled();
    for (const call of [boundary.create, boundary.leave, boundary.next, boundary.close, boundary.configure, boundary.changed, boundary.left]) {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it.each([
    { name: "next round", invoke: nextRoundAction, mutation: boundary.next, expected: { accountId: "session-account", raceId: RACE } },
    { name: "close", invoke: closeRoomAction, mutation: boundary.close, expected: { accountId: "session-account", code: "ABCDEF" } },
    {
      name: "configure",
      invoke: configureRoomAction,
      mutation: boundary.configure,
      expected: { accountId: "session-account", code: "ABCDEF", revision: 0, settings: { textLanguage: "fr", timeLimitMs: 60_000, errorMode: "mandatory" } },
    },
  ])("$name ignores a forged host identity and preserves the transactional refusal", async ({ invoke, mutation, expected }) => {
    mutation.mockResolvedValue({ ok: false, error: "NOT_HOST" });
    expect(await invoke(form())).toEqual({ error: "NOT_HOST" });
    expect(mutation).toHaveBeenCalledExactlyOnceWith(expect.anything(), expected);
    expect(boundary.changed).not.toHaveBeenCalled();
    expect(boundary.left).not.toHaveBeenCalled();
  });

  it("creation assigns the host from the session and the texts' language from the request, not from the form", async () => {
    boundary.create.mockResolvedValue({ ok: true, room: { id: "room", code: "ABCDEF" } });
    await expect(createRoomAction({}, form())).rejects.toThrow("redirect /rooms/ABCDEF");
    expect(boundary.create).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ accountId: "session-account", textLanguage: "en" }));
  });

  it("leaving uses only the authenticated account and cannot redirect off-site", async () => {
    boundary.leave.mockResolvedValue(undefined);
    const data = form();
    data.set("returnTo", "//attacker.invalid/path");
    await expect(leaveRoomAction({}, data)).rejects.toEqual(new Error("redirect /"));
    expect(boundary.leave).toHaveBeenCalledExactlyOnceWith(expect.anything(), "session-account", expect.any(Function));
  });

  it("leaving reads current process presence lazily and announces a transfer without closure", async () => {
    const presence = roomPresence();
    boundary.leave.mockImplementation(async (_db: unknown, _accountId: string, online: (lobbyId: string) => ReadonlySet<string>) => {
      // The socket arrives after action entry, before the database asks for its snapshot.
      presence.add("succession-room", "successor", "socket");
      expect(online("succession-room")).toEqual(new Set(["successor"]));
      return { lobbyId: "succession-room", closed: false };
    });
    try {
      await expect(leaveRoomAction({}, form())).rejects.toThrow("redirect /");
      expect(boundary.left).toHaveBeenCalledExactlyOnceWith("succession-room", "session-account", false);
      expect(boundary.changed).toHaveBeenCalledExactlyOnceWith("succession-room");
    } finally {
      presence.remove("succession-room", "successor", "socket");
    }
  });

  it("a failed departure is unavailable and announces neither closure nor transfer", async () => {
    boundary.leave.mockRejectedValue(new Error("storage unavailable"));
    expect(await leaveRoomAction({}, form())).toEqual({ error: "UNAVAILABLE" });
    expect(boundary.left).not.toHaveBeenCalled();
    expect(boundary.changed).not.toHaveBeenCalled();
  });
});
