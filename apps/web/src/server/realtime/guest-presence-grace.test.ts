import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GuestDepartureInput, GuestDepartureResult } from "@incision/database";
import type { RoomPhase } from "@incision/domain";
import { GuestPresenceGrace } from "./guest-presence-grace";

const member = { lobbyId: "room", memberId: "guest-member" };
beforeEach(() => vi.useFakeTimers({ now: 1_800_000_000_000 }));
afterEach(() => vi.useRealTimers());
function setup() {
  const state = { phase: "waiting" as RoomPhase, expiresAt: Date.now() + 86_400_000, online: false, host: false, gone: false };
  const callbacks: (() => void)[] = [];
  const end = vi.fn(async (input: GuestDepartureInput): Promise<GuestDepartureResult> => {
    if (state.gone) return { kind: "gone" };
    if (state.host) return { kind: "host" };
    const row = { phase: state.phase, expiresAt: state.expiresAt, expired: Date.now() >= state.expiresAt };
    if ((row.expired || row.phase === "waiting" || row.phase === "results") && input.claim(row)) {
      state.gone = true;
      return { kind: "departed" };
    }
    return { kind: "retained", ...row };
  });
  const departed = vi.fn(), failed = vi.fn();
  const grace = new GuestPresenceGrace({ now: Date.now, online: () => state.online,
    end, departed, failed,
    schedule: (callback, delay) => { callbacks.push(callback); const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
  });
  return { grace, state, end, departed, failed, callbacks };
}
async function flush() { for (let n = 0; n < 12; n++) await Promise.resolve(); }

describe("guest non-host presence grace", () => {
  it.each(["waiting", "results"] as const)("releases %s presence only after the inclusive 30-second deadline, once", async (phase) => {
    const { grace, state, departed } = setup(); state.phase = phase;
    grace.lost(member); grace.lost(member); await flush();
    await vi.advanceTimersByTimeAsync(29_999); expect(state.gone).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(state.gone).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(state.gone).toBe(true);
    grace.changed(member.lobbyId); await flush();
    expect(departed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining(member));
    grace.stop();
  });

  it.each([29_999, 30_000, 30_001])("serializes reconnect at %s with the deadline, even before a delayed timer fires", async (delay) => {
    const { grace, state } = setup();
    grace.lost(member); await flush();
    vi.setSystemTime(Date.now() + delay);
    expect(await grace.resume(member)).toBe(delay <= 30_000);
    expect(state.gone).toBe(delay > 30_000);
    grace.stop();
  });

  it("does not start grace with another socket online or extend it on duplicate losses", async () => {
    const { grace, state, end } = setup();
    state.online = true; grace.lost(member); await flush(); expect(end).not.toHaveBeenCalled();
    state.online = false; grace.lost(member); await flush();
    await vi.advanceTimersByTimeAsync(20_000); grace.lost(member);
    await vi.advanceTimersByTimeAsync(10_001); expect(state.gone).toBe(true);
    grace.stop();
  });

  it("ignores callbacks from a previous loss after reconnect and a new loss", async () => {
    const { grace, callbacks, state } = setup();
    grace.lost(member); await flush(); const old = callbacks[0];
    await vi.advanceTimersByTimeAsync(20_000); expect(await grace.resume(member)).toBe(true);
    grace.lost(member); await flush(); old?.(); await flush();
    await vi.advanceTimersByTimeAsync(10_001); expect(state.gone).toBe(false);
    await vi.advanceTimersByTimeAsync(20_000); expect(state.gone).toBe(true);
    grace.stop();
  });

  it("keeps the original loss across racing -> results, without a second grace", async () => {
    const { grace, state } = setup(); state.phase = "racing";
    grace.lost(member); await flush();
    await vi.advanceTimersByTimeAsync(20_000); state.phase = "results"; grace.changed(member.lobbyId); await flush();
    await vi.advanceTimersByTimeAsync(10_000); expect(state.gone).toBe(false);
    await vi.advanceTimersByTimeAsync(1); expect(state.gone).toBe(true);
    grace.stop();
  });

  it("leaves race abandonment to the engine then releases at results if the grace already elapsed", async () => {
    const { grace, state } = setup(); state.phase = "racing";
    grace.lost(member); await flush();
    await vi.advanceTimersByTimeAsync(40_000); expect(state.gone).toBe(false);
    state.phase = "results"; grace.changed(member.lobbyId); await flush(); expect(state.gone).toBe(true);
    grace.stop();
  });

  it("does not lose a results notification while an older phase read is in flight", async () => {
    const { grace, state, end } = setup(); state.phase = "racing";
    grace.lost(member); await flush();
    let release = () => {}; const pending = new Promise<void>((resolve) => { release = resolve; });
    end.mockImplementationOnce(async () => {
      const before = { kind: "retained" as const, phase: state.phase, expiresAt: state.expiresAt, expired: false };
      await pending; return before;
    });
    vi.setSystemTime(Date.now() + 30_001); grace.changed(member.lobbyId);
    state.phase = "results"; grace.changed(member.lobbyId);
    release(); await flush(); expect(state.gone).toBe(true); grace.stop();
  });

  it("excludes hosts, including promotion before the timeout decision", async () => {
    const { grace, state, departed } = setup(); grace.lost(member); await flush();
    state.host = true; await vi.advanceTimersByTimeAsync(30_001);
    expect(state.gone).toBe(false); expect(departed).not.toHaveBeenCalled(); grace.stop();
  });

  it("gives session expiry priority even during a course", async () => {
    const { grace, state } = setup(); state.phase = "racing"; state.expiresAt = Date.now() + 10_000;
    grace.lost(member); await flush(); await vi.advanceTimersByTimeAsync(10_000);
    expect(state.gone).toBe(true); grace.stop();
  });

  it("rechecks renewal at the old expiry without extending the presence grace", async () => {
    const { grace, state } = setup(); state.expiresAt = Date.now() + 10_000;
    grace.lost(member); await flush(); state.expiresAt += 86_400_000;
    await vi.advanceTimersByTimeAsync(10_000); expect(state.gone).toBe(false);
    await vi.advanceTimersByTimeAsync(20_001); expect(state.gone).toBe(true); grace.stop();
  });

  it("lets a reconnect before the synchronous claim cancel a transaction waiting for SQL", async () => {
    const { grace, end, state } = setup(); let release = () => {};
    const read = new Promise<void>((resolve) => { release = resolve; });
    const actual = end.getMockImplementation()!;
    end.mockImplementationOnce(async (input) => { await read; return actual(input); });
    grace.lost(member); expect(await grace.resume(member)).toBe(true);
    release(); await flush(); expect(state.gone).toBe(false); grace.stop();
  });

  it("holds reconnect after claim until commit, then refuses the old member", async () => {
    const { grace, end, state } = setup(); grace.lost(member); await flush();
    let release = () => {}; const commit = new Promise<void>((resolve) => { release = resolve; });
    end.mockImplementationOnce(async (input) => {
      expect(input.claim({ phase: "waiting", expiresAt: state.expiresAt, expired: false })).toBe(true);
      await commit; state.gone = true; return { kind: "departed" };
    });
    vi.setSystemTime(Date.now() + 30_001); grace.changed(member.lobbyId); await flush();
    let resumed = false; const reconnect = grace.resume(member).then((allowed) => { resumed = true; return allowed; });
    await flush(); expect(resumed).toBe(false); release(); expect(await reconnect).toBe(false); grace.stop();
  });

  it("does not admit a late reconnect on database failure and retries idempotently", async () => {
    const { grace, end, state, failed } = setup(); grace.lost(member); await flush();
    end.mockRejectedValueOnce(new Error("synthetic outage"));
    vi.setSystemTime(Date.now() + 30_001); expect(await grace.resume(member)).toBe(false);
    expect(failed).toHaveBeenCalledOnce(); expect(state.gone).toBe(false);
    await vi.advanceTimersByTimeAsync(1_000); expect(state.gone).toBe(true); grace.stop();
  });
});
