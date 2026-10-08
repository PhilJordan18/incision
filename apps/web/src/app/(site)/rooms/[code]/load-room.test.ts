import type { RoomCode } from "@incision/domain";
import { afterEach, describe, expect, it, vi } from "vitest";

// The room page's loader with a database that does not answer: no request, no real pool.
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-incision-client-address": "203.0.113.1" }) }));
vi.mock("@/server/auth/store", () => ({ authDatabase: () => ({}) }));
const failure = vi.hoisted(() => ({ throwNextRedirect: false }));

vi.mock("@incision/database", async (importOriginal) => {
  // The shape of Drizzle's query error when PostgreSQL fails: its message quotes the parameters.
  const cause = Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014", severity: "ERROR" });
  const databaseError = Object.assign(new Error("Failed query: select … where account_id = $1 params: alice-ABCDEF"), {
    query: "select … where account_id = $1",
    params: ["alice-ABCDEF"],
    cause,
  });
  return {
    ...(await importOriginal<typeof import("@incision/database")>()),
    findActiveMembership: async () => {
      if (failure.throwNextRedirect) {
        const { redirect } = await import("next/navigation");
        redirect("/elsewhere");
      }
      throw databaseError;
    },
  };
});

const { loadRoomPage } = await import("./load-room");

afterEach(() => {
  failure.throwNextRedirect = false;
  vi.restoreAllMocks();
});

describe("loadRoomPage", () => {
  it("shows the page as unavailable when the database fails, and logs no query parameter", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await loadRoomPage("alice", "ABCDEF" as RoomCode)).toEqual({ kind: "unavailable" });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("ABCDEF");
  });

  it("lets Next's own control flow through instead of reporting it as a failure", async () => {
    failure.throwNextRedirect = true;
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(loadRoomPage("alice", "BCDEFG" as RoomCode)).rejects.toThrow("NEXT_REDIRECT");
    expect(log).not.toHaveBeenCalled();
  });
});
