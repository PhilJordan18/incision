import { describe, expect, it, vi } from "vitest";
import { GuestCommandGate, GUEST_COMMAND_LIMIT } from "./guest-command-gate";
import { SessionRegistry } from "./session-registry";

const proof = { id: "guest", secretDigest: "synthetic-digest" };
const member = { proof, lobbyId: "room", memberId: "member", alive: () => true };
function setup() {
  const state = { now: 1_800_000_000_000, calls: 0, invalid: false, failAfterRun: false, wait: undefined as Promise<void> | undefined, activity: [] as boolean[] };
  const registry = new SessionRegistry(() => state.now);
  const refreshed = vi.spyOn(registry, "refreshGuest");
  const gate = new GuestCommandGate({ now: () => state.now, registry, store: async (input) => {
    state.calls++;
    if (state.wait !== undefined) await state.wait;
    if (state.invalid) return { kind: "unauthorized" };
    const result = input.run(); state.activity.push(result.activity);
    if (state.failAfterRun) throw new Error("synthetic SQL failure after callback");
    return { kind: "authorized", answer: result.answer, session: { id: input.proof.id, expiresAt: new Date(state.now + 86_400_000) } };
  } });
  return { gate, state, refreshed };
}
const accepted = () => ({ answer: { ok: true } as const, activity: true });

describe("guest command gate", () => {
  it("shares the ten-per-second pre-SQL budget across tabs without passive timers", async () => {
    const { gate, state } = setup();
    for (let n = 0; n < GUEST_COMMAND_LIMIT.maxPerSecond; n++) expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: true });
    expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(state.calls).toBe(10);
    state.now += 999; expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: false, error: "RATE_LIMITED" });
    state.now += 1; expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: true });
  });

  it("allows only one in-flight command per guest while another guest remains independent", async () => {
    const { gate, state } = setup(); let release = () => {};
    state.wait = new Promise<void>((resolve) => { release = resolve; });
    const first = gate.run({ ...member, apply: accepted });
    expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: false, error: "RATE_LIMITED" });
    const other = gate.run({ ...member, proof: { ...proof, id: "other" }, apply: accepted });
    expect(state.calls).toBe(2); release(); await Promise.all([first, other]);
  });

  it("passes only server-confirmed activity; refusals and replayed sequences are not activity", async () => {
    const { gate, state, refreshed } = setup();
    await gate.run({ ...member, apply: accepted });
    await gate.run({ ...member, apply: () => ({ answer: { ok: false, error: "NOT_CONTROLLING" }, activity: false }) });
    await gate.run({ ...member, apply: () => ({ answer: { ok: true, result: { outcome: "duplicate" } }, activity: false }) });
    expect(state.activity).toEqual([true, false, false]);
    expect(refreshed).toHaveBeenCalledTimes(3); // Verified reads also synchronize existing deadlines; they do not write activity.
  });

  it("rechecks socket membership/liveness after SQL awaited, without invoking the action", async () => {
    const { gate, state } = setup(); let alive = true, release = () => {};
    state.wait = new Promise<void>((resolve) => { release = resolve; });
    const apply = vi.fn(accepted);
    const pending = gate.run({ ...member, alive: () => alive, apply });
    alive = false; release();
    expect(await pending).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(apply).not.toHaveBeenCalled(); expect(state.activity).toEqual([false]);
  });

  it("refuses invalid SQL identities without executing or refreshing", async () => {
    const { gate, state, refreshed } = setup(); state.invalid = true; const apply = vi.fn(accepted);
    expect(await gate.run({ ...member, apply })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(apply).not.toHaveBeenCalled(); expect(refreshed).not.toHaveBeenCalled();
  });

  it("never retries a callback after SQL failure and releases its in-flight slot", async () => {
    const { gate, state } = setup(); state.failAfterRun = true; const apply = vi.fn(accepted);
    expect(await gate.run({ ...member, apply })).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(apply).toHaveBeenCalledOnce(); state.failAfterRun = false;
    expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: true });
  });
});
