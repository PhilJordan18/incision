/** Process-local authority fence (single-instance runtime). Shared with Next bundles. */
class GuestCommandFence {
  epoch = 0;
  pending = 0;
  readonly #waiters = new Set<() => void>();
  async mutation<T>(work: () => Promise<T>): Promise<T> {
    this.pending++; this.epoch++;
    try { return await work(); }
    finally {
      this.pending--; this.epoch++;
      if (this.pending === 0) { for (const resolve of this.#waiters) resolve(); this.#waiters.clear(); }
    }
  }
  async idle(): Promise<void> {
    while (this.pending > 0) await new Promise<void>((resolve) => this.#waiters.add(resolve));
  }
}
const shared = globalThis as typeof globalThis & { incisionGuestCommandFence?: GuestCommandFence };
export function guestCommandFence(): GuestCommandFence { return shared.incisionGuestCommandFence ??= new GuestCommandFence(); }
