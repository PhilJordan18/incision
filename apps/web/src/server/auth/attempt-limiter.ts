export type AttemptLimit = { readonly maxFailures: number; readonly windowMs: number };

type Window = { failures: number; readonly startedAt: number };

/**
 * Counts failed attempts per key in fixed windows, in memory (one instance, ADR-0001).
 * A key is blocked once it reaches `maxFailures` until its window ends. Successful
 * attempts do not reset the count: a correct guess after many failures still waits.
 * The map is bounded: when full, expired windows are dropped, then the oldest one.
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
      // Insertion order: the first key is the oldest window.
      const oldest = this.#windows.keys().next();
      if (!oldest.done) {
        this.#windows.delete(oldest.value);
      }
    }
  }
}
