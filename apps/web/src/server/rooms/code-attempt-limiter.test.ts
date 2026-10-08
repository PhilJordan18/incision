import { describe, expect, it } from "vitest";
import { CODE_ATTEMPT_LIMITS, type CodeAttempt, CodeAttemptLimiter, type CodeAttemptLimits, type Timers } from "./code-attempt-limiter";

/** Deterministic clock and timers: time moves only when a test says so. */
class FakeTime implements Timers {
  now = 1_000_000;
  #next = 0;
  readonly #timers = new Map<number, { at: number; callback: () => void }>();

  readonly setTimeout = (callback: () => void, delayMs: number): unknown => {
    this.#next += 1;
    this.#timers.set(this.#next, { at: this.now + delayMs, callback });
    return this.#next;
  };

  readonly clearTimeout = (handle: unknown): void => {
    this.#timers.delete(handle as number);
  };

  advance(ms: number): void {
    this.now += ms;
    for (const [handle, timer] of [...this.#timers]) {
      if (timer.at <= this.now) {
        this.#timers.delete(handle);
        timer.callback();
      }
    }
  }

  get pendingTimers(): number {
    return this.#timers.size;
  }
}

type Deferred<Value> = { promise: Promise<Value>; resolve: (value: Value) => void; reject: (error: unknown) => void };

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<Value>((ok, ko) => {
    resolve = ok;
    reject = ko;
  });
  return { promise, resolve, reject };
}

/** Lets every pending promise callback run. */
const settled = () => new Promise<void>((resolve) => setImmediate(resolve));

type Outcome = "miss" | "hit";
const isMiss = (outcome: Outcome) => outcome === "miss";

function setup(limits: Partial<CodeAttemptLimits> = {}) {
  const time = new FakeTime();
  const limiter = new CodeAttemptLimiter({ ...CODE_ATTEMPT_LIMITS, ...limits }, () => time.now, time);
  let running = 0;
  let maxRunning = 0;
  const runningByKey = new Map<string, number>();
  let maxRunningForOneKey = 0;
  const calls: string[] = [];
  /** A lookup that stays pending until the test settles it, tracking concurrency. */
  function pendingLookup(key: string) {
    const result = deferred<Outcome>();
    const lookup = async () => {
      calls.push(key);
      running += 1;
      runningByKey.set(key, (runningByKey.get(key) ?? 0) + 1);
      maxRunning = Math.max(maxRunning, running);
      maxRunningForOneKey = Math.max(maxRunningForOneKey, runningByKey.get(key) ?? 0);
      try {
        return await result.promise;
      } finally {
        running -= 1;
        runningByKey.set(key, (runningByKey.get(key) ?? 1) - 1);
      }
    };
    return { lookup, result };
  }
  const attempt = (key: string, outcome: Outcome) => limiter.attempt(key, async () => outcome, isMiss);
  return {
    time,
    limiter,
    attempt,
    pendingLookup,
    calls,
    get maxRunning() {
      return maxRunning;
    },
    get maxRunningForOneKey() {
      return maxRunningForOneKey;
    },
  };
}

const refused = (attempt: CodeAttempt<unknown>) => (attempt.ok ? undefined : attempt.refusal);

describe("CodeAttemptLimiter budget", () => {
  it("allows 10 failures per address and minute, then refuses before any lookup", async () => {
    const { attempt, limiter } = setup();
    for (let index = 0; index < 10; index += 1) {
      expect((await attempt("203.0.113.1", "miss")).ok).toBe(true);
    }
    let looked = false;
    const eleventh = await limiter.attempt(
      "203.0.113.1",
      async () => {
        looked = true;
        return "hit" as Outcome;
      },
      isMiss,
    );
    expect(refused(eleventh)).toBe("CODE_RATE_LIMITED");
    expect(looked).toBe(false);
    expect(limiter.isExhausted("203.0.113.1")).toBe(true);
    // Another address keeps its own budget.
    expect((await attempt("203.0.113.2", "miss")).ok).toBe(true);
  });

  it("never debits a lookup that is not a failure", async () => {
    const { attempt, limiter } = setup();
    for (let index = 0; index < 9; index += 1) {
      await attempt("203.0.113.1", "miss");
    }
    for (let index = 0; index < 20; index += 1) {
      expect((await attempt("203.0.113.1", "hit")).ok).toBe(true);
    }
    expect((await attempt("203.0.113.1", "miss")).ok).toBe(true);
    expect(limiter.isExhausted("203.0.113.1")).toBe(true);
  });

  it("forgets each failure 60 seconds after it happened", async () => {
    const { attempt, time } = setup();
    await attempt("203.0.113.1", "miss");
    time.advance(30_000);
    for (let index = 0; index < 9; index += 1) {
      await attempt("203.0.113.1", "miss");
    }
    expect(refused(await attempt("203.0.113.1", "miss"))).toBe("CODE_RATE_LIMITED");
    time.advance(30_000);
    // Only the first failure left the window: one more attempt, then refused again.
    expect((await attempt("203.0.113.1", "miss")).ok).toBe(true);
    expect(refused(await attempt("203.0.113.1", "miss"))).toBe("CODE_RATE_LIMITED");
  });

  it("lets a burst of parallel failures make at most 10 lookups", async () => {
    const harness = setup();
    const pending = Array.from({ length: 30 }, () => harness.pendingLookup("203.0.113.1"));
    const attempts = pending.map(({ lookup }) => harness.limiter.attempt("203.0.113.1", lookup, isMiss));
    for (const { result } of pending) {
      result.resolve("miss");
      await settled();
    }
    const outcomes = await Promise.all(attempts);
    expect(harness.calls).toHaveLength(10);
    expect(outcomes.filter((outcome) => outcome.ok)).toHaveLength(10);
    expect(outcomes.filter((outcome) => refused(outcome) === "CODE_RATE_LIMITED")).toHaveLength(20);
    expect(harness.limiter.stats()).toEqual({ inFlight: 0, queued: 0, addresses: 1 });
  });

  it("keeps failures plus lookups in flight within the budget when an address may run several at once", async () => {
    const harness = setup({ maxInFlightPerAddress: 4, maxInFlight: 4 });
    for (let index = 0; index < 8; index += 1) {
      await harness.attempt("203.0.113.1", "miss");
    }
    const pending = Array.from({ length: 6 }, () => harness.pendingLookup("203.0.113.1"));
    const attempts = pending.map(({ lookup }) => harness.limiter.attempt("203.0.113.1", lookup, isMiss));
    await settled();
    // Two failures left in the budget: only two lookups may run, even with four slots.
    expect(harness.calls).toHaveLength(2);
    for (const { result } of pending) {
      result.resolve("miss");
      await settled();
    }
    const outcomes = await Promise.all(attempts);
    expect(harness.calls).toHaveLength(2);
    expect(outcomes.filter((outcome) => refused(outcome) === "CODE_RATE_LIMITED")).toHaveLength(4);
  });

  it("serves 30 valid admissions behind one address without spending its budget", async () => {
    const harness = setup();
    const pending = Array.from({ length: 30 }, () => harness.pendingLookup("198.51.100.7"));
    const attempts = pending.map(({ lookup }) => harness.limiter.attempt("198.51.100.7", lookup, isMiss));
    for (const { result } of pending) {
      result.resolve("hit");
      await settled();
    }
    const outcomes = await Promise.all(attempts);
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true);
    expect(harness.calls).toHaveLength(30);
    expect(harness.maxRunningForOneKey).toBe(1);
    expect(harness.limiter.isExhausted("198.51.100.7")).toBe(false);
    for (let index = 0; index < 10; index += 1) {
      expect((await harness.attempt("198.51.100.7", "miss")).ok).toBe(true);
    }
  });
});

describe("CodeAttemptLimiter concurrency", () => {
  it("never runs more than 1 lookup per address and 2 in all", async () => {
    const harness = setup();
    const keys = ["203.0.113.1", "203.0.113.2", "203.0.113.3"];
    const pending = keys.flatMap((key) => Array.from({ length: 4 }, () => ({ key, ...harness.pendingLookup(key) })));
    const attempts = pending.map(({ key, lookup }) => harness.limiter.attempt(key, lookup, isMiss));
    await settled();
    expect(harness.calls).toHaveLength(2);
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 2, queued: 10 });
    for (const { result } of pending) {
      result.resolve("hit");
      await settled();
    }
    await Promise.all(attempts);
    expect(harness.calls).toHaveLength(12);
    expect(harness.maxRunning).toBe(2);
    expect(harness.maxRunningForOneKey).toBe(1);
    expect(harness.limiter.stats()).toEqual({ inFlight: 0, queued: 0, addresses: 3 });
  });

  it("refuses beyond 30 waiting requests for one address and 100 in all", async () => {
    const harness = setup();
    const first = harness.pendingLookup("203.0.113.1");
    const attempts = [harness.limiter.attempt("203.0.113.1", first.lookup, isMiss)];
    for (let index = 0; index < 30; index += 1) {
      attempts.push(harness.attempt("203.0.113.1", "hit"));
    }
    expect(refused(await harness.attempt("203.0.113.1", "hit"))).toBe("CODE_BUSY");

    const blockers = ["203.0.113.2", "203.0.113.3"].map((key) => ({ key, ...harness.pendingLookup(key) }));
    // One slot left in all: the second blocker waits, as do the next 69 requests.
    attempts.push(...blockers.map(({ key, lookup }) => harness.limiter.attempt(key, lookup, isMiss)));
    for (let index = 0; index < 69; index += 1) {
      attempts.push(harness.attempt(`198.51.100.${index}`, "hit"));
    }
    await settled();
    expect(harness.limiter.stats().queued).toBe(100);
    expect(refused(await harness.attempt("192.0.2.1", "hit"))).toBe("CODE_BUSY");

    first.result.resolve("hit");
    for (const { result } of blockers) {
      result.resolve("hit");
    }
    await Promise.all(attempts);
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 0, queued: 0 });
  });

  it("removes a waiter at its deadline, and it never runs its lookup afterwards", async () => {
    const harness = setup();
    const first = harness.pendingLookup("203.0.113.1");
    const running = harness.limiter.attempt("203.0.113.1", first.lookup, isMiss);
    const second = harness.pendingLookup("203.0.113.1");
    const waiting = harness.limiter.attempt("203.0.113.1", second.lookup, isMiss);
    await settled();
    harness.time.advance(CODE_ATTEMPT_LIMITS.queueTimeoutMs);
    expect(refused(await waiting)).toBe("CODE_BUSY");
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 1, queued: 0 });
    first.result.resolve("hit");
    await running;
    await settled();
    expect(harness.calls).toEqual(["203.0.113.1"]);
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 0, queued: 0 });
    expect(harness.time.pendingTimers).toBe(0);
  });

  it("removes a waiter whose request was cancelled, and it never runs its lookup", async () => {
    const harness = setup();
    const first = harness.pendingLookup("203.0.113.1");
    const running = harness.limiter.attempt("203.0.113.1", first.lookup, isMiss);
    const cancel = new AbortController();
    const second = harness.pendingLookup("203.0.113.1");
    const waiting = harness.limiter.attempt("203.0.113.1", second.lookup, isMiss, cancel.signal);
    await settled();
    cancel.abort();
    expect(refused(await waiting)).toBe("CODE_BUSY");
    first.result.resolve("hit");
    await running;
    await settled();
    expect(harness.calls).toHaveLength(1);
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 0, queued: 0 });
    expect(harness.time.pendingTimers).toBe(0);
  });

  it("releases the slot of a lookup that throws, without spending the budget", async () => {
    const harness = setup();
    const failing = harness.pendingLookup("203.0.113.1");
    const broken = harness.limiter.attempt("203.0.113.1", failing.lookup, isMiss);
    const next = harness.pendingLookup("203.0.113.1");
    const waiting = harness.limiter.attempt("203.0.113.1", next.lookup, isMiss);
    failing.result.reject(new Error("database unavailable"));
    await expect(broken).rejects.toThrow("database unavailable");
    await settled();
    // The waiting request got the slot.
    expect(harness.calls).toHaveLength(2);
    next.result.resolve("hit");
    expect((await waiting).ok).toBe(true);
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 0, queued: 0 });
    expect(harness.limiter.isExhausted("203.0.113.1")).toBe(false);
    for (let index = 0; index < 10; index += 1) {
      expect((await harness.attempt("203.0.113.1", "miss")).ok).toBe(true);
    }
  });

  it("refuses the waiters of an address that spends its budget meanwhile", async () => {
    const harness = setup();
    for (let index = 0; index < 9; index += 1) {
      await harness.attempt("203.0.113.1", "miss");
    }
    const tenth = harness.pendingLookup("203.0.113.1");
    const running = harness.limiter.attempt("203.0.113.1", tenth.lookup, isMiss);
    const waiters = [harness.pendingLookup("203.0.113.1"), harness.pendingLookup("203.0.113.1")];
    const waiting = waiters.map(({ lookup }) => harness.limiter.attempt("203.0.113.1", lookup, isMiss));
    await settled();
    tenth.result.resolve("miss");
    await running;
    const outcomes = await Promise.all(waiting);
    expect(outcomes.map(refused)).toEqual(["CODE_RATE_LIMITED", "CODE_RATE_LIMITED"]);
    // Only the tenth lookup ran; the waiters never did.
    expect(harness.calls).toHaveLength(1);
    expect(harness.limiter.stats()).toMatchObject({ inFlight: 0, queued: 0 });
  });
});

describe("CodeAttemptLimiter memory", () => {
  it("refuses a new address rather than forget one that still counts", async () => {
    const { attempt, limiter, time } = setup({ maxAddresses: 3 });
    for (const key of ["203.0.113.1", "203.0.113.2"]) {
      await attempt(key, "miss");
    }
    for (let index = 0; index < 10; index += 1) {
      await attempt("203.0.113.3", "miss");
    }
    // Full, and every address still has failures in its window: the new one is refused.
    expect(refused(await attempt("192.0.2.1", "hit"))).toBe("CODE_BUSY");
    expect(limiter.isExhausted("203.0.113.3")).toBe(true);
    expect(limiter.stats().addresses).toBe(3);

    // Once their failures leave the window, idle addresses make room.
    time.advance(CODE_ATTEMPT_LIMITS.windowMs);
    expect((await attempt("192.0.2.1", "hit")).ok).toBe(true);
    expect(limiter.stats().addresses).toBe(1);
  });

  it("forgets an idle address first when the memory is full", async () => {
    const { attempt, limiter } = setup({ maxAddresses: 2 });
    await attempt("203.0.113.1", "hit");
    for (let index = 0; index < 10; index += 1) {
      await attempt("203.0.113.2", "miss");
    }
    expect((await attempt("192.0.2.1", "hit")).ok).toBe(true);
    expect(limiter.isExhausted("203.0.113.2")).toBe(true);
    expect(limiter.stats().addresses).toBe(2);
  });
});
