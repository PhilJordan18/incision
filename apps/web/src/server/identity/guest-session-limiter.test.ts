import { describe, expect, it } from "vitest";
import { GuestSessionLimiter } from "./guest-session-limiter";

describe("guest session budgets", () => {
  it("keeps capacity for another address during repeated slow renewals", () => {
    let now = 0;
    const limiter = new GuestSessionLimiter(() => now);
    for (let cycle = 0; cycle < 24; cycle += 1) {
      const releases = Array.from({ length: 8 }, () => limiter.acquire("slow", false));
      expect(releases.filter(Boolean)).toHaveLength(2);
      const other = limiter.acquire("other", false);
      expect(other).toBeDefined();
      other?.();
      releases.forEach((release) => { release?.(); release?.(); });
      now += 5000;
    }
  });
  it("does not evict an address with pending work when its budgets expire", () => {
    let now = 0;
    const limiter = new GuestSessionLimiter(() => now);
    const first = limiter.acquire("slow", false);
    const second = limiter.acquire("slow", false);
    now = 900001;
    limiter.acquire("new", false)?.();
    expect(limiter.acquire("slow", false)).toBeUndefined();
    first?.(); first?.();
    expect(limiter.acquire("slow", false)).toBeDefined();
    expect(limiter.acquire("slow", false)).toBeUndefined();
    second?.();
  });
  it("allows a classroom, then refuses creation without resetting through release or renewal", () => {
    let now = 0;
    const limiter = new GuestSessionLimiter(() => now);
    for (let i = 0; i < 120; i += 1) {
      const release = limiter.acquire("classroom", true);
      expect(release).toBeDefined();
      release?.(); release?.();
    }
    expect(limiter.acquire("classroom", true)).toBeUndefined();
    limiter.acquire("classroom", false)?.();
    now = 60_000;
    expect(limiter.acquire("classroom", true)).toBeUndefined();
    now = 900_000;
    expect(limiter.acquire("classroom", true)).toBeDefined();
  });
  it("bounds concurrent work before async identity/database checks", () => {
    const limiter = new GuestSessionLimiter();
    const releases = Array.from({ length: 8 }, (_, i) => limiter.acquire(String(i), false));
    expect(releases.every(Boolean)).toBe(true);
    expect(limiter.acquire("other", false)).toBeUndefined();
    releases[0]?.();
    expect(limiter.acquire("other", false)).toBeDefined();
  });
  it("bounds reads and does not evict live address budgets", () => {
    const limiter = new GuestSessionLimiter(() => 0);
    for (let i = 0; i < 240; i += 1) limiter.acquire("same", false)?.();
    expect(limiter.acquire("same", false)).toBeUndefined();
    for (let i = 0; i < 9999; i += 1) limiter.acquire(String(i), false)?.();
    expect(limiter.acquire("new", false)).toBeUndefined();
    expect(limiter.acquire("same", false)).toBeUndefined();
  });
});
