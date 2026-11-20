/**
 * Limits of room-code lookups (SALLE-10, D-01). Failures are what an attacker guessing codes
 * produces (unknown, private or closed rooms); a class joining with a valid code produces
 * none, so admissions never consume the budget.
 */
export const CODE_ATTEMPT_LIMITS = {
  /** Failed attempts one address may make in the window. */
  maxFailures: 10,
  windowMs: 60_000,
  /** Lookups by code running at once, for one address and for the whole process. */
  maxInFlightPerAddress: 1,
  maxInFlight: 2,
  /** Requests waiting for a lookup slot, for one address and for the whole process. */
  maxQueuedPerAddress: 30,
  maxQueued: 100,
  /** A waiting request gives up after this delay and never runs its lookup afterwards. */
  queueTimeoutMs: 5_000,
  /** Addresses remembered at once. */
  maxAddresses: 10_000,
} as const;

export type CodeAttemptLimits = { readonly [Name in keyof typeof CODE_ATTEMPT_LIMITS]: number };

/**
 * CODE_RATE_LIMITED: the address spent its failure budget. CODE_BUSY: no slot came free in
 * time, or the limiter cannot remember one more address. Neither says anything about a code.
 */
export type CodeAttemptRefusal = "CODE_RATE_LIMITED" | "CODE_BUSY";

export type CodeAttempt<Result> =
  | { readonly ok: true; readonly value: Result }
  | { readonly ok: false; readonly refusal: CodeAttemptRefusal };

/** Runs `callback` after `delayMs` and returns a function that cancels it. */
export type Schedule = (callback: () => void, delayMs: number) => () => void;

type AddressState = {
  /** Times of the failures still inside the window, oldest first (at most maxFailures). */
  failures: number[];
  inFlight: number;
  queued: number;
};

type Waiter = {
  readonly state: AddressState;
  /** Settles the waiter once: undefined starts its lookup (the slot is already reserved). */
  readonly settle: (refusal: CodeAttemptRefusal | undefined) => void;
};

const systemSchedule: Schedule = (callback, delayMs) => {
  const timer = setTimeout(callback, delayMs);
  return () => clearTimeout(timer);
};

/**
 * Budget of failed room-code attempts per address, and the queue that shares lookups by code.
 *
 * A lookup reserves its slot synchronously, before any `await`, and settles synchronously
 * when it ends, in a `finally`: its outcome is recorded (a failure or not) and the slot is
 * released even when the lookup throws. Per address, failures in the window plus lookups in
 * flight never exceed `maxFailures`, so no burst can produce more failures than the budget.
 * A request that cannot start waits in one first-in-first-out queue, bounded globally and
 * per address; it is removed at its deadline or when its signal aborts, and a removed
 * request never runs its lookup.
 *
 * The state lives in this process's memory: a restart resets it, and two processes would
 * each have their own budget. Incision runs a single instance (ADR-0002).
 */
export class CodeAttemptLimiter {
  readonly #addresses = new Map<string, AddressState>();
  readonly #queue: Waiter[] = [];
  #inFlight = 0;

  constructor(
    private readonly limits: CodeAttemptLimits = CODE_ATTEMPT_LIMITS,
    private readonly now: () => number = Date.now,
    private readonly schedule: Schedule = systemSchedule,
  ) {}

  /**
   * Runs `lookup` for `key` once a slot is free and the budget allows it. `isFailure` says
   * whether its result consumes the budget; a lookup that throws consumes nothing.
   */
  async attempt<Result>(
    key: string,
    lookup: () => Promise<Result>,
    isFailure: (result: Result) => boolean,
    signal?: AbortSignal,
  ): Promise<CodeAttempt<Result>> {
    const state = this.#stateOf(key);
    if (state === undefined) {
      return { ok: false, refusal: "CODE_BUSY" };
    }
    const refusal = await this.#acquire(state, signal);
    if (refusal !== undefined) {
      return { ok: false, refusal };
    }
    let failed = false;
    try {
      const value = await lookup();
      failed = isFailure(value);
      return { ok: true, value };
    } finally {
      this.#release(state, failed);
    }
  }

  /** True while `key` has spent its budget: a lookup by code would be refused. */
  isExhausted(key: string): boolean {
    const state = this.#addresses.get(key);
    return state !== undefined && this.#failuresInWindow(state) >= this.limits.maxFailures;
  }

  /** Counters for tests and diagnostics; no address is exposed. */
  stats(): { readonly inFlight: number; readonly queued: number; readonly addresses: number } {
    return { inFlight: this.#inFlight, queued: this.#queue.length, addresses: this.#addresses.size };
  }

  #acquire(state: AddressState, signal: AbortSignal | undefined): Promise<CodeAttemptRefusal | undefined> {
    if (this.#failuresInWindow(state) >= this.limits.maxFailures) {
      return Promise.resolve("CODE_RATE_LIMITED");
    }
    // After every dispatch no queued request can start, so starting now overtakes nobody.
    if (this.#canStart(state)) {
      this.#reserve(state);
      return Promise.resolve(undefined);
    }
    if (signal?.aborted === true || state.queued >= this.limits.maxQueuedPerAddress || this.#queue.length >= this.limits.maxQueued) {
      return Promise.resolve("CODE_BUSY");
    }
    return new Promise((resolve) => {
      let settled = false;
      const onAbort = () => waiter.settle("CODE_BUSY");
      const cancelDeadline = this.schedule(() => waiter.settle("CODE_BUSY"), this.limits.queueTimeoutMs);
      const waiter: Waiter = {
        state,
        settle: (refusal) => {
          if (settled) {
            return;
          }
          settled = true;
          cancelDeadline();
          signal?.removeEventListener("abort", onAbort);
          const index = this.#queue.indexOf(waiter);
          if (index >= 0) {
            this.#queue.splice(index, 1);
          }
          state.queued -= 1;
          resolve(refusal);
        },
      };
      signal?.addEventListener("abort", onAbort, { once: true });
      this.#queue.push(waiter);
      state.queued += 1;
    });
  }

  /** The state is the one reserved: an address with a lookup in flight is never forgotten. */
  #release(state: AddressState, failed: boolean): void {
    this.#inFlight -= 1;
    state.inFlight -= 1;
    if (failed) {
      state.failures.push(this.now());
    }
    this.#dispatch();
  }

  /** Refuses the waiters whose address spent its budget, then starts those that can, in order. */
  #dispatch(): void {
    for (const waiter of [...this.#queue]) {
      if (this.#failuresInWindow(waiter.state) >= this.limits.maxFailures) {
        waiter.settle("CODE_RATE_LIMITED");
      } else if (this.#canStart(waiter.state)) {
        this.#reserve(waiter.state);
        waiter.settle(undefined);
      }
    }
  }

  #canStart(state: AddressState): boolean {
    return (
      this.#inFlight < this.limits.maxInFlight &&
      state.inFlight < this.limits.maxInFlightPerAddress &&
      this.#failuresInWindow(state) + state.inFlight < this.limits.maxFailures
    );
  }

  #reserve(state: AddressState): void {
    state.inFlight += 1;
    this.#inFlight += 1;
  }

  #failuresInWindow(state: AddressState): number {
    const oldest = this.now() - this.limits.windowMs;
    while ((state.failures[0] ?? Number.POSITIVE_INFINITY) <= oldest) {
      state.failures.shift();
    }
    return state.failures.length;
  }

  /**
   * The state of `key`, created if there is room. When the map is full, only idle addresses
   * (no failure in the window, nothing in flight or queued) are forgotten; if none is idle,
   * the new address is refused: an address that spent its budget is never forgotten.
   */
  #stateOf(key: string): AddressState | undefined {
    const existing = this.#addresses.get(key);
    if (existing !== undefined) {
      return existing;
    }
    if (this.#addresses.size >= this.limits.maxAddresses) {
      for (const [candidate, state] of this.#addresses) {
        if (this.#failuresInWindow(state) === 0 && state.inFlight === 0 && state.queued === 0) {
          this.#addresses.delete(candidate);
        }
      }
      if (this.#addresses.size >= this.limits.maxAddresses) {
        return undefined;
      }
    }
    const state: AddressState = { failures: [], inFlight: 0, queued: 0 };
    this.#addresses.set(key, state);
    return state;
  }
}
