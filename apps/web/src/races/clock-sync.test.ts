import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClockSync } from "./clock-sync";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(10_000); });
afterEach(() => vi.useRealTimers());
function setup() {
  let wallJump = 0;
  const changed = vi.fn();
  const clock = new ClockSync({
    now: () => Date.now() + wallJump,
    monotonic: Date.now,
    schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
    changed,
  });
  return { clock, changed, jump: (ms: number) => { wallJump = ms; } };
}
function replyAfter(delay: number, serverTime: number): Promise<unknown> {
  return new Promise((resolve) => setTimeout(() => resolve({ ok: true, serverTime }), delay));
}

describe("round-trip display clock", () => {
  it("removes symmetric network delay and keeps advancing through a browser wall-clock adjustment", async () => {
    const { clock, jump } = setup();
    clock.observe(15_000);
    expect(clock.now()).toBe(15_000);
    clock.start(() => replyAfter(200, 15_100));
    await vi.advanceTimersByTimeAsync(200);
    expect(clock.now()).toBe(15_200);
    jump(60_000);
    await vi.advanceTimersByTimeAsync(100);
    expect(clock.now()).toBe(15_300);
    clock.observe(9_000);
    expect(clock.now()).toBe(15_300);
    clock.stop();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("retains the shortest RTT, rejecting a later congested sample", async () => {
    const { clock } = setup();
    const ping = vi.fn()
      .mockImplementationOnce(() => replyAfter(100, 15_050))
      .mockImplementationOnce(() => replyAfter(400, 15_360))
      .mockImplementationOnce(() => replyAfter(20, 16_010));
    clock.start(ping);
    await vi.advanceTimersByTimeAsync(750);
    expect(clock.now()).toBe(15_750); // the second sample would underestimate by 190 ms
    await vi.advanceTimersByTimeAsync(270);
    expect(clock.now()).toBe(16_020);
    expect(ping).toHaveBeenCalledTimes(3);
    clock.stop();
  });

  it("expires the shortest old sample so a changed server clock can be learned", async () => {
    const { clock } = setup();
    let calls = 0;
    clock.start(() => {
      calls += 1;
      return replyAfter(calls === 1 ? 10 : 20, Date.now() + (calls === 1 ? 5_005 : 6_010));
    });
    await vi.advanceTimersByTimeAsync(90_600);
    expect(clock.now()).toBe(Date.now() + 5_000);
    await vi.advanceTimersByTimeAsync(30_100);
    expect(clock.now()).toBe(Date.now() + 6_000);
    clock.stop();
  });

  it.each([null, {}, { ok: false, error: "INVALID_PAYLOAD" }, { ok: true, serverTime: Infinity },
    { ok: true, serverTime: -1 }, { ok: true, serverTime: "123" }, { ok: true, serverTime: 1, extra: true }])(
    "ignores malformed replies without changing the fallback: %j", async (reply) => {
      const { clock, changed } = setup();
      clock.observe(15_000);
      clock.start(async () => reply);
      await vi.advanceTimersByTimeAsync(0);
      expect(clock.now()).toBe(15_000);
      expect(changed).not.toHaveBeenCalled();
      clock.stop();
    },
  );

  it("times out a lost probe and recovers without parallel polling", async () => {
    const { clock } = setup();
    const ping = vi.fn().mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementation(() => replyAfter(20, Date.now() + 5_010));
    clock.start(ping);
    await vi.advanceTimersByTimeAsync(5_249);
    expect(ping).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(21);
    expect(ping).toHaveBeenCalledTimes(2);
    expect(clock.now()).toBe(Date.now() + 5_000);
    clock.stop();
  });

  it("ignores answers from the previous connection, and stops all future probes on cleanup", async () => {
    const { clock, changed } = setup();
    let oldReply: ((value: unknown) => void) | undefined;
    clock.start(() => new Promise((resolve) => { oldReply = resolve; }));
    const ping = vi.fn(() => replyAfter(20, 15_010));
    clock.start(ping);
    await vi.advanceTimersByTimeAsync(20);
    oldReply?.({ ok: true, serverTime: 999_999 });
    await vi.advanceTimersByTimeAsync(0);
    expect(clock.now()).toBe(15_020);
    expect(changed).toHaveBeenCalledTimes(1);
    clock.stop();
    await vi.advanceTimersByTimeAsync(180_000);
    expect(ping).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not accept a response received after stop", async () => {
    const { clock, changed } = setup();
    clock.start(() => replyAfter(100, 99_999));
    clock.stop();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(changed).not.toHaveBeenCalled();
    expect(clock.now()).toBe(11_000);
    expect(vi.getTimerCount()).toBe(0);
  });
});
