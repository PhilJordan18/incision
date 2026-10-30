import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GuestActivityRefresh, withGuestCookieLock } from "./guest-browser";
const schedule = (callback: () => void, delay: number) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); };
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("accepted guest activity cookie synchronization", () => {
  it("does nothing on an idle tab, sends immediately on acceptance, then bounds a burst", async () => {
    const refresh = vi.fn(async () => {});
    const client = new GuestActivityRefresh({ now: Date.now, schedule, refresh, failed: vi.fn() });
    await vi.advanceTimersByTimeAsync(86_400_000); expect(refresh).not.toHaveBeenCalled();
    client.accepted(); await vi.advanceTimersByTimeAsync(0); expect(refresh).toHaveBeenCalledOnce();
    for (let n = 0; n < 100; n++) client.accepted();
    await vi.advanceTimersByTimeAsync(59_999); expect(refresh).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1); expect(refresh).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(86_400_000); expect(refresh).toHaveBeenCalledTimes(2);
    client.stop();
  });
  it("never overlaps a slow refresh and preserves one pending accepted event", async () => {
    let release = () => {}; const pending = new Promise<void>((resolve) => { release = resolve; });
    const refresh = vi.fn().mockReturnValueOnce(pending).mockResolvedValue(undefined);
    const client = new GuestActivityRefresh({ now: Date.now, schedule, refresh, failed: vi.fn() });
    client.accepted(); client.accepted();
    await vi.advanceTimersByTimeAsync(120_000); expect(refresh).toHaveBeenCalledOnce();
    release(); await vi.advanceTimersByTimeAsync(0); expect(refresh).toHaveBeenCalledTimes(2);
    client.stop();
  });
  it("does not turn a failed request into a background heartbeat", async () => {
    const refresh = vi.fn().mockRejectedValue(new Error("offline")); const failed = vi.fn();
    const client = new GuestActivityRefresh({ now: Date.now, schedule, refresh, failed });
    client.accepted(); await vi.advanceTimersByTimeAsync(86_400_000);
    expect(refresh).toHaveBeenCalledOnce(); expect(failed).toHaveBeenCalledOnce(); client.stop();
  });
  it("cancels a trailing refresh when the presence ends", async () => {
    const refresh = vi.fn(async () => {});
    const client = new GuestActivityRefresh({ now: Date.now, schedule, refresh, failed: vi.fn() });
    client.accepted(); await vi.advanceTimersByTimeAsync(0); client.accepted(); client.stop(); client.accepted();
    await vi.advanceTimersByTimeAsync(86_400_000); expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("guest cookie lock", () => {
  it("uses one shared origin lock without reading a credential", async () => {
    const request = vi.fn(async (_name: string, callback: () => Promise<string>) => callback());
    vi.stubGlobal("navigator", { locks: { request } });
    expect(await withGuestCookieLock(async () => "done")).toBe("done");
    expect(request).toHaveBeenCalledWith("incision:guest-cookie", expect.any(Function));
  });
  it("refuses an unsafe fallback when cross-tab locking is unavailable", async () => {
    vi.stubGlobal("navigator", {}); const work = vi.fn();
    await expect(withGuestCookieLock(work)).rejects.toThrow("coordination unavailable");
    expect(work).not.toHaveBeenCalled();
  });
});
