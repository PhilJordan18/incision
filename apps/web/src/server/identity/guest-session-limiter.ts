type Bucket = { requests: number; requestUntil: number; starts: number; startUntil: number; inFlight: number };

/** Single-process abuse bounds, not a person/IP identity or a persistent ban. */
export class GuestSessionLimiter {
  readonly #buckets = new Map<string, Bucket>();
  #inFlight = 0;
  constructor(private readonly now: () => number = Date.now) {}

  acquire(address: string, creating: boolean): (() => void) | undefined {
    const now = this.now();
    if (this.#inFlight >= 8) return undefined;
    let bucket = this.#buckets.get(address);
    if (bucket === undefined) {
      // Never evict a live budget: rotating addresses cannot clear another caller's limit.
      for (const [key, value] of this.#buckets) {
        if (value.inFlight === 0 && value.requestUntil <= now && value.startUntil <= now) this.#buckets.delete(key);
      }
      if (this.#buckets.size >= 10_000) return undefined;
      bucket = { requests: 0, requestUntil: now + 60_000, starts: 0, startUntil: now + 900_000, inFlight: 0 };
      this.#buckets.set(address, bucket);
    }
    if (bucket.requestUntil <= now) { bucket.requests = 0; bucket.requestUntil = now + 60_000; }
    if (bucket.startUntil <= now) { bucket.starts = 0; bucket.startUntil = now + 900_000; }
    // Allows a classroom's initial guests behind one NAT; failed requests still cost budget.
    // Slow request bodies from one address must not occupy every global slot.
    if (bucket.inFlight >= 2 || bucket.requests >= 240 || (creating && bucket.starts >= 120)) return undefined;
    bucket.requests += 1;
    if (creating) bucket.starts += 1;
    this.#inFlight += 1;
    bucket.inFlight += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.#inFlight -= 1;
      bucket.inFlight -= 1;
    };
  }
}
