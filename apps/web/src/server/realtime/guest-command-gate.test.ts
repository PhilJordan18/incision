import { guestCommandFence } from "@incision/database";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestCommandGate, GUEST_COMMAND_LIMIT } from "./guest-command-gate";
import { SessionRegistry } from "./session-registry";

const proof = { id: "guest", secretDigest: "synthetic-digest" };
const member = { proof, lobbyId: "room", memberId: "member", alive: () => true };
afterEach(() => vi.useRealTimers());
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
    expect(state.calls).toBe(1);
    state.now += 999; expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: false, error: "RATE_LIMITED" });
    state.now += 1; expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: true });
  });

  it("allows only one in-flight command per guest while another guest remains independent", async () => {
    const { gate, state } = setup(); let release = () => {};
    state.wait = new Promise<void>((resolve) => { release = resolve; });
    const first = gate.run({ ...member, apply: accepted });
    expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: false, error: "RATE_LIMITED" });
    const other = gate.run({ ...member, proof: { ...proof, id: "other" }, apply: accepted });
    await Promise.resolve();
    expect(state.calls).toBe(2); release(); await Promise.all([first, other]);
  });

  it("passes only server-confirmed activity; refusals and replayed sequences are not activity", async () => {
    const { gate, state, refreshed } = setup();
    await gate.run({ ...member, apply: accepted });
    await gate.run({ ...member, apply: () => ({ answer: { ok: false, error: "NOT_CONTROLLING" }, activity: false }) });
    await gate.run({ ...member, apply: () => ({ answer: { ok: true, result: { outcome: "duplicate" } }, activity: false }) });
    expect(state.activity).toEqual([true]);
    expect(refreshed).toHaveBeenCalledTimes(1); // Cached refusals/duplicates do not write or renew.
  });

  it("rechecks socket membership/liveness after SQL awaited, without invoking the action", async () => {
    const { gate, state } = setup(); let alive = true, release = () => {};
    state.wait = new Promise<void>((resolve) => { release = resolve; });
    const apply = vi.fn(accepted);
    const pending = gate.run({ ...member, alive: () => alive, apply });
    await Promise.resolve();
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

describe("coalesced guest SQL cost and authority", () => {
  it("serves 30 guests and 18000 batches with one initial read/write and one flush each, without SQL latency per batch", async () => {
    vi.useFakeTimers();
    const { gate, state } = setup();
    for (let tick = 0; tick < 600; tick++) {
      for (let n = 0; n < 30; n++) {
        expect(await gate.run({ ...member, proof: { ...proof, id: `guest-${n}` }, memberId: `member-${n}`, apply: accepted })).toEqual({ ok: true });
      }
      state.now += 100; await vi.advanceTimersByTimeAsync(100);
    }
    expect(state.calls).toBe(60); // Thirty initial authorizations, thirty timed flushes.
    await gate.stop();
  });

  it("persists acceptance time, not flush time, and never writes again on an idle tab", async () => {
    vi.useFakeTimers(); let now = 1_800_000_000_000;
    const timestamps: (number | undefined)[] = [];
    const store: import("./guest-command-gate").GuestCommandStore = async (input) => {
      const result = input.run(); if (result.activity) timestamps.push(result.activityAt);
      return { kind: "authorized", answer: result.answer, session: { id: input.proof.id, expiresAt: new Date((result.activityAt ?? now) + 86_400_000) } };
    };
    const gate = new GuestCommandGate({ now: () => now, store, registry: new SessionRegistry(() => now) });
    await gate.run({ ...member, apply: accepted }); now += 100;
    await gate.run({ ...member, apply: accepted });
    await gate.run({ ...member, apply: () => ({ answer: "duplicate", activity: false }) });
    const lastAccepted = now;
    now += 59_900; await vi.advanceTimersByTimeAsync(60_000);
    expect(timestamps).toEqual([1_800_000_000_000, lastAccepted]);
    now += 86_400_000; await vi.advanceTimersByTimeAsync(86_400_000);
    expect(timestamps).toHaveLength(2); await gate.stop();
  });

  it("blocks during departure/closure, invalidates cached rights and refuses after the commit", async () => {
    const { gate, state } = setup(); await gate.run({ ...member, apply: accepted });
    let release = () => {}; const mutation = guestCommandFence().mutation(() => new Promise<void>((resolve) => { release = resolve; }));
    const apply = vi.fn(accepted); const command = gate.run({ ...member, apply });
    await Promise.resolve(); expect(apply).not.toHaveBeenCalled();
    state.invalid = true; release(); await mutation;
    expect(await command).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(apply).not.toHaveBeenCalled(); await gate.stop();
  });

  it("does not apply a callback when a revocation begins while SQL authorization is pending", async () => {
    const { gate, state } = setup(); let release = () => {};
    state.wait = new Promise<void>((resolve) => { release = resolve; });
    const apply = vi.fn(accepted); const command = gate.run({ ...member, apply }); await Promise.resolve();
    let finish = () => {}; const mutation = guestCommandFence().mutation(() => new Promise<void>((resolve) => { finish = resolve; }));
    release(); expect(await command).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(apply).not.toHaveBeenCalled(); finish(); await mutation; await gate.stop();
  });

  it("revalidates SQL after expiry and never resurrects an expired grant", async () => {
    const { gate, state } = setup(); await gate.run({ ...member, apply: accepted });
    state.now += 86_400_000; state.invalid = true;
    const apply = vi.fn(accepted); expect(await gate.run({ ...member, apply })).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(apply).not.toHaveBeenCalled(); await gate.stop();
  });

  it("fails closed on persistence failure without replaying accepted engine commands", async () => {
    vi.useFakeTimers(); const { gate, state } = setup();
    const revoke = vi.spyOn(gate.options.registry, "revokeGuest"); const apply = vi.fn(accepted);
    await gate.run({ ...member, apply }); state.now += 100; await gate.run({ ...member, apply });
    state.failAfterRun = true; state.now += 59_900; await vi.advanceTimersByTimeAsync(60_000);
    expect(revoke).toHaveBeenCalledWith(proof.id); expect(apply).toHaveBeenCalledTimes(2);
    await gate.stop();
  });

  it("drains the last accepted activity on graceful stop and refuses further commands", async () => {
    const { gate, state } = setup(); await gate.run({ ...member, apply: accepted });
    state.now += 100; await gate.run({ ...member, apply: accepted }); expect(state.calls).toBe(1);
    await gate.stop(); expect(state.calls).toBe(2);
    expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: false, error: "UNAVAILABLE" });
  });
});


it("acknowledges cached commands without waiting for a slow database", async () => {
  const { gate, state } = setup(); await gate.run({ ...member, apply: accepted });
  state.wait = new Promise<void>(() => {});
  // If a batch accidentally calls SQL this test times out instead of acknowledging.
  expect(await gate.run({ ...member, apply: accepted })).toEqual({ ok: true });
  expect(state.calls).toBe(1);
  state.wait = undefined; await gate.stop();
});
