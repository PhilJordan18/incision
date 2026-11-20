/** Sliding account window, shared across tabs. Capacity exhaustion fails closed:
 * never evict an active account and accidentally restore its activation budget.
 */
export class BonusActivationLimiter {
  readonly #windows = new Map<string, number[]>();
  constructor(private readonly now: () => number, private readonly maxAccounts = 10_000) {}

  allow(accountId: string): boolean {
    const now = this.now();
    for (const [key, times] of this.#windows) {
      if (now - times[times.length - 1]! >= 1_000) this.#windows.delete(key);
    }
    const previous = this.#windows.get(accountId);
    if (previous === undefined && this.#windows.size >= this.maxAccounts) return false;
    const recent = (previous ?? []).filter((at) => now - at < 1_000);
    if (recent.length >= 5) return false;
    this.#windows.set(accountId, [...recent, now]);
    return true;
  }
}
