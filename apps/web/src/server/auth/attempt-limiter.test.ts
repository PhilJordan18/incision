import { describe, expect, it } from "vitest";
import { AttemptLimiter } from "./attempt-limiter";

describe("AttemptLimiter", () => {
  it("blocks a key after the maximum failures, until its window ends", () => {
    let now = 0;
    const limiter = new AttemptLimiter({ maxFailures: 3, windowMs: 1_000 }, () => now);
    for (let failure = 0; failure < 3; failure += 1) {
      expect(limiter.isBlocked("alice")).toBe(false);
      limiter.recordFailure("alice");
    }
    expect(limiter.isBlocked("alice")).toBe(true);
    expect(limiter.isBlocked("bob")).toBe(false);
    now = 999;
    expect(limiter.isBlocked("alice")).toBe(true);
    now = 1_000;
    expect(limiter.isBlocked("alice")).toBe(false);
  });

  it("stays bounded in memory, dropping expired windows first, then the oldest", () => {
    let now = 0;
    const limiter = new AttemptLimiter({ maxFailures: 1, windowMs: 1_000 }, () => now, 2);
    limiter.recordFailure("a");
    now = 500;
    limiter.recordFailure("b");
    limiter.recordFailure("c");
    expect(limiter.isBlocked("a")).toBe(false);
    expect(limiter.isBlocked("b")).toBe(true);
    expect(limiter.isBlocked("c")).toBe(true);
    now = 1_200;
    limiter.recordFailure("d");
    expect(limiter.isBlocked("b")).toBe(false);
    expect(limiter.isBlocked("c")).toBe(true);
    expect(limiter.isBlocked("d")).toBe(true);
  });
});
