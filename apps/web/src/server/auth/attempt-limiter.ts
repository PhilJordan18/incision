export type AttemptLimit = { readonly maxFailures: number; readonly windowMs: number };

type Window = { failures: number; readonly startedAt: number };

/**
 * Counts failed attempts per key in fixed windows, in memory (one instance, ADR-0001).
 * A key is blocked once it reaches `maxFailures` until its window ends. Callers count an
 * attempt as a failure before any `await` and `forgive` it once it succeeds, so parallel
 * attempts cannot all pass the check before one of them is counted. A success does not
 * reset earlier failures: a correct guess after many failures still waits.
 * The map is bounded: when full, expired windows are dropped, then the oldest window that
 * blocks nothing (the oldest of all only if every window blocks).
 */
export class AttemptLimiter {
  readonly #windows = new Map<string, Window>();

  constructor(
    private readonly limit: AttemptLimit,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  isBlocked(key: string): boolean {
    const window = this.#current(key);
    return window !== undefined && window.failures >= this.limit.maxFailures;
  }

  recordFailure(key: string): void {
    const window = this.#current(key);
    if (window !== undefined) {
      window.failures += 1;
      return;
    }
    this.#makeRoom();
    this.#windows.set(key, { failures: 1, startedAt: this.now() });
  }

  /** Takes back one failure counted for an attempt that succeeded, or that never ran. */
  forgive(key: string): void {
    const window = this.#current(key);
    if (window !== undefined && window.failures > 0) {
      window.failures -= 1;
    }
  }

  #current(key: string): Window | undefined {
    const window = this.#windows.get(key);
    if (window !== undefined && this.now() - window.startedAt >= this.limit.windowMs) {
      this.#windows.delete(key);
      return undefined;
    }
    return window;
  }

  #makeRoom(): void {
    if (this.#windows.size < this.maxKeys) {
      return;
    }
    const now = this.now();
    for (const [key, window] of this.#windows) {
      if (now - window.startedAt >= this.limit.windowMs) {
        this.#windows.delete(key);
      }
    }
    if (this.#windows.size >= this.maxKeys) {
      // The oldest window that is not blocking anything: flooding the map with new keys
      // must not lift a block. Insertion order: the first keys are the oldest windows.
      let victim: string | undefined;
      for (const [key, window] of this.#windows) {
        if (window.failures < this.limit.maxFailures) {
          victim = key;
          break;
        }
      }
      victim ??= this.#windows.keys().next().value;
      if (victim !== undefined) {
        this.#windows.delete(victim);
      }
    }
  }
}
