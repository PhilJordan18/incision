import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestRetentionWorker } from "./guest-retention-worker";
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
const report = { departed: [], purgedRooms: [], unusedSessions: 0 };
const schedule = (callback: () => void, delay: number) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); };
describe("local guest retention worker", () => {
  it("runs immediately, never overlaps, and stops scheduling on shutdown", async () => {
    let release = () => {}; const pending = new Promise<void>((resolve) => { release = resolve; });
    const run = vi.fn(async () => { await pending; return report; }); const committed = vi.fn();
    const worker = new GuestRetentionWorker({ run, committed, failed: vi.fn(), schedule });
    await vi.advanceTimersByTimeAsync(90_000); expect(run).toHaveBeenCalledOnce();
    release(); await vi.advanceTimersByTimeAsync(0); expect(committed).toHaveBeenCalledWith(report);
    await vi.advanceTimersByTimeAsync(29_999); expect(run).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(run).toHaveBeenCalledTimes(2);
    worker.stop(); await vi.advanceTimersByTimeAsync(90_000); expect(run).toHaveBeenCalledTimes(2);
  });
  it("contains a failed batch and retries without any renewal operation", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("synthetic outage")).mockResolvedValue(report);
    const failed = vi.fn(); const committed = vi.fn();
    const worker = new GuestRetentionWorker({ run, failed, committed, schedule });
    await vi.advanceTimersByTimeAsync(0); expect(failed).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(30_000); expect(run).toHaveBeenCalledTimes(2); expect(committed).toHaveBeenCalledWith(report);
    worker.stop();
  });
});
