import type { RoomCode } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";

// The room page's loader with a database that does not answer: no request, no real pool.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-incision-client-address": "203.0.113.1" }) }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
vi.mock("@incision/database", async (importOriginal) => {
  // The shape of Drizzle's query error when PostgreSQL fails: its message quotes the parameters.
  const cause = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014", severity: "ERROR" });
  const failure = Object.assign(new Error("Failed query: select … where account_id = $1 params: alice-ABCDEF"), {
    query: "select … where account_id = $1",
    params: ["alice-ABCDEF"],
    cause,
  });
  return {
    ...(await importOriginal<typeof import("@incision/database")>()),
    findActiveMembership: async () => {
      throw failure;
    },
  };
});

const { loadRoomPage } = await import("./load-room");

describe("loadRoomPage", () => {
  it("shows the page as unavailable when the database fails, and logs no query parameter", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadRoomPage("alice", "ABCDEF" as RoomCode)).toEqual({ kind: "unavailable" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("ABCDEF");
    log.mockRestore();
  });
});
