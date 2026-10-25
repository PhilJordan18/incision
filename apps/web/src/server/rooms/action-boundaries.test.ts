import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercise the exported server actions directly: rendering a protected page is not an
// authorization boundary. Database stubs expose any call made before the session guard.
const boundary = vi.hoisted(() => ({
  requireSession: vi.fn(),
  database: vi.fn(() => ({})),
  create: vi.fn(),
  leave: vi.fn(),
  next: vi.fn(),
  close: vi.fn(),
  changed: vi.fn(),
  left: vi.fn(),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
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
}));

const { createRoomAction, leaveRoomAction, nextRoundAction, closeRoomAction } = await import("./actions");
const processGlobal = globalThis as typeof globalThis & { incisionRoomChanges?: unknown };
const RACE = "6f1c2a7e-3b4d-4e5f-8a9b-0c1d2e3f4a5b";

function form(): FormData {
  const value = new FormData();
  value.set("code", "ABCDEF");
  value.set("raceId", RACE);
  value.set("accountId", "forged-host");
  value.set("hostMemberId", "forged-member");
  return value;
}

beforeEach(() => {
  vi.resetAllMocks();
  delete processGlobal.incisionRoomChanges;
  boundary.requireSession.mockResolvedValue({ accountId: "session-account" });
});
afterEach(() => { delete processGlobal.incisionRoomChanges; });

const guardedActions = [
  { name: "create", invoke: (data: FormData) => createRoomAction({}, data) },
  { name: "leave", invoke: (data: FormData) => leaveRoomAction({}, data) },
  { name: "next round", invoke: nextRoundAction },
  { name: "close", invoke: closeRoomAction },
];

describe("server-action identity boundaries (SEC-01)", () => {
  it.each(guardedActions)("$name cannot mutate or announce anything without a session", async ({ invoke }) => {
    boundary.requireSession.mockRejectedValue(new Error("redirect /sign-in"));
    await expect(invoke(form())).rejects.toThrow("redirect /sign-in");
    expect(boundary.database).not.toHaveBeenCalled();
    for (const call of [boundary.create, boundary.leave, boundary.next, boundary.close, boundary.changed, boundary.left]) {
      expect(call).not.toHaveBeenCalled();
    }
  });

  it.each([
    { name: "next round", invoke: nextRoundAction, mutation: boundary.next, expected: { accountId: "session-account", raceId: RACE } },
    { name: "close", invoke: closeRoomAction, mutation: boundary.close, expected: { accountId: "session-account", code: "ABCDEF" } },
  ])("$name ignores a forged host identity and preserves the transactional refusal", async ({ invoke, mutation, expected }) => {
    mutation.mockResolvedValue({ ok: false, error: "NOT_HOST" });
    expect(await invoke(form())).toEqual({ error: "NOT_HOST" });
    expect(mutation).toHaveBeenCalledExactlyOnceWith(expect.anything(), expected);
    expect(boundary.changed).not.toHaveBeenCalled();
    expect(boundary.left).not.toHaveBeenCalled();
  });

  it("creation assigns the host from the session, not the submitted account", async () => {
    boundary.create.mockResolvedValue({ ok: true, room: { id: "room", code: "ABCDEF" } });
    await expect(createRoomAction({}, form())).rejects.toThrow("redirect /rooms/ABCDEF");
    expect(boundary.create).toHaveBeenCalledExactlyOnceWith(expect.anything(), expect.objectContaining({ accountId: "session-account" }));
  });

  it("leaving uses only the authenticated account and cannot redirect off-site", async () => {
    boundary.leave.mockResolvedValue(undefined);
    const data = form();
    data.set("returnTo", "//attacker.invalid/path");
    await expect(leaveRoomAction({}, data)).rejects.toEqual(new Error("redirect /"));
    expect(boundary.leave).toHaveBeenCalledExactlyOnceWith(expect.anything(), "session-account");
  });
});
