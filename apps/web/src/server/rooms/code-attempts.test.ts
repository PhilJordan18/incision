import { describe, expect, it, vi } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { CODE_ATTEMPT_LIMITS, CodeAttemptLimiter } from "./code-attempt-limiter";
import { allowOwnRoomRead, joinSpendsBudget, lookupSpendsBudget, OWN_ROOM_READS_WHILE_LIMITED } from "./code-attempts";

// The module reads request headers through Next; these tests only use its pure functions.
vi.mock("next/headers", () => ({ headers: vi.fn() }));

describe("which outcomes spend the code budget", () => {
  it("spends it for unknown, private and closed rooms only", () => {
    expect(joinSpendsBudget({ ok: false, error: "ROOM_NOT_FOUND" })).toBe(true);
    expect(joinSpendsBudget({ ok: false, error: "ROOM_NOT_ADMITTING", phase: "closed" })).toBe(true);
    expect(joinSpendsBudget({ ok: false, error: "ROOM_NOT_ADMITTING", phase: "countdown" })).toBe(false);
    expect(joinSpendsBudget({ ok: false, error: "ROOM_NOT_ADMITTING", phase: "racing" })).toBe(false);
    expect(joinSpendsBudget({ ok: false, error: "ROOM_FULL" })).toBe(false);
    expect(joinSpendsBudget({ ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: "ABCDEF" })).toBe(false);
    expect(joinSpendsBudget({ ok: false, error: "ACCOUNT_NOT_FOUND" })).toBe(false);
    expect(joinSpendsBudget({ ok: true, lobbyId: "l", memberId: "m", alreadyMember: false })).toBe(false);

    expect(lookupSpendsBudget(undefined)).toBe(true);
    expect(lookupSpendsBudget({ phase: "closed" })).toBe(true);
    for (const phase of ["waiting", "countdown", "racing", "results"] as const) {
      expect(lookupSpendsBudget({ phase })).toBe(false);
    }
  });
});

describe("allowOwnRoomRead", () => {
  it("is free within the budget and bounded per account once the address spent it", async () => {
    const codes = new CodeAttemptLimiter(CODE_ATTEMPT_LIMITS);
    const ownRoomReads = new AttemptLimiter(OWN_ROOM_READS_WHILE_LIMITED);
    const limiters = { codes, ownRoomReads };
    for (let index = 0; index < 50; index += 1) {
      expect(allowOwnRoomRead("203.0.113.1", "alice", limiters)).toBe(true);
    }
    for (let index = 0; index < 10; index += 1) {
      await codes.attempt("203.0.113.1", async () => undefined, () => true);
    }
    for (let index = 0; index < 20; index += 1) {
      expect(allowOwnRoomRead("203.0.113.1", "alice", limiters)).toBe(true);
    }
    expect(allowOwnRoomRead("203.0.113.1", "alice", limiters)).toBe(false);
    // Another account behind the same address has its own allowance.
    expect(allowOwnRoomRead("203.0.113.1", "bruno", limiters)).toBe(true);
  });
});
