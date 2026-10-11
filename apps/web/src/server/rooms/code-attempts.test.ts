import type { ActiveMembership } from "@incision/database";
import type { RoomCode } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import { AttemptLimiter } from "@/server/auth/attempt-limiter";
import { CODE_ATTEMPT_LIMITS, CodeAttemptLimiter } from "./code-attempt-limiter";
import { allowOwnRoomRead, findOwnRoom, joinSpendsBudget, lookupSpendsBudget, OWN_ROOM_READS_WHILE_LIMITED } from "./code-attempts";

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

describe("findOwnRoom", () => {
  const own: ActiveMembership = { lobbyId: "lobby", code: "ABCDEF", memberId: "member", isHost: false };
  const code = (value: string) => value as RoomCode;

  async function spentBudget(codes: CodeAttemptLimiter, addressKey: string): Promise<void> {
    for (let index = 0; index < 10; index += 1) {
      await codes.attempt(addressKey, async () => undefined, () => true);
    }
  }

  it("finds one's own room by account id, within the budget or over it", async () => {
    const limiters = { codes: new CodeAttemptLimiter(CODE_ATTEMPT_LIMITS), ownRoomReads: new AttemptLimiter(OWN_ROOM_READS_WHILE_LIMITED) };
    const readMembership = vi.fn(async () => own);
    expect(await findOwnRoom({ addressKey: "a", accountId: "alice", code: code("ABCDEF") }, readMembership, limiters)).toEqual({ kind: "own", membership: own });
    await spentBudget(limiters.codes, "a");
    expect(await findOwnRoom({ addressKey: "a", accountId: "alice", code: code("ABCDEF") }, readMembership, limiters)).toEqual({ kind: "own", membership: own });
    expect(readMembership).toHaveBeenCalledWith("alice");
  });

  it("over budget, refuses any other code before anything else is counted", async () => {
    const limiters = { codes: new CodeAttemptLimiter(CODE_ATTEMPT_LIMITS), ownRoomReads: new AttemptLimiter(OWN_ROOM_READS_WHILE_LIMITED) };
    expect(await findOwnRoom({ addressKey: "a", accountId: "alice", code: code("ZZZZZZ") }, async () => own, limiters)).toEqual({
      kind: "elsewhere",
      membership: own,
    });
    await spentBudget(limiters.codes, "a");
    expect(await findOwnRoom({ addressKey: "a", accountId: "alice", code: code("ZZZZZZ") }, async () => own, limiters)).toEqual({ kind: "limited" });
    expect(await findOwnRoom({ addressKey: "a", accountId: "bruno", code: code("ZZZZZZ") }, async () => undefined, limiters)).toEqual({ kind: "limited" });
  });

  it("stops reading the membership once the account used its allowance over budget", async () => {
    const limiters = { codes: new CodeAttemptLimiter(CODE_ATTEMPT_LIMITS), ownRoomReads: new AttemptLimiter(OWN_ROOM_READS_WHILE_LIMITED) };
    await spentBudget(limiters.codes, "a");
    const readMembership = vi.fn(async () => own);
    for (let index = 0; index < 20; index += 1) {
      await findOwnRoom({ addressKey: "a", accountId: "alice", code: code("ABCDEF") }, readMembership, limiters);
    }
    expect(await findOwnRoom({ addressKey: "a", accountId: "alice", code: code("ABCDEF") }, readMembership, limiters)).toEqual({ kind: "limited" });
    expect(readMembership).toHaveBeenCalledTimes(20);
  });
});
