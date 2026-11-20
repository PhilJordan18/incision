/** Serialize cookie-changing requests between tabs without ever reading HttpOnly data. */
export async function withGuestCookieLock<T>(work: () => Promise<T>): Promise<T> {
  if (typeof navigator === "undefined" || navigator.locks === undefined) {
    throw new Error("Guest cookie coordination unavailable");
  }
  return navigator.locks.request("incision:guest-cookie", work);
}

type Cancel = () => void;
/** Accepted server events alone schedule cookie synchronization; idle tabs do nothing. */
export class GuestActivityRefresh {
  #stopped = false;
  #pending = false;
  #running = false;
  #lastStarted = -Infinity;
  #cancel: Cancel | undefined;
  constructor(readonly options: {
    readonly now: () => number;
    readonly schedule: (callback: () => void, delay: number) => Cancel;
    readonly refresh: () => Promise<void>;
    readonly failed: () => void;
  }) {}

  accepted(): void {
    if (this.#stopped) return;
    this.#pending = true;
    this.#schedule();
  }

  #schedule(): void {
    if (this.#stopped || this.#running || this.#cancel !== undefined || !this.#pending) return;
    const wait = Math.max(0, this.#lastStarted + 60_000 - this.options.now());
    if (wait === 0) { void this.#refresh(); return; }
    this.#cancel = this.options.schedule(() => {
      this.#cancel = undefined;
      void this.#refresh();
    }, wait);
  }

  async #refresh(): Promise<void> {
    if (this.#stopped) return;
    this.#pending = false;
    this.#running = true;
    this.#lastStarted = this.options.now();
    try { await this.options.refresh(); }
    catch { if (!this.#stopped) this.options.failed(); }
    finally { this.#running = false; this.#schedule(); }
  }

  stop(): void { this.#stopped = true; this.#pending = false; this.#cancel?.(); this.#cancel = undefined; }
}


/** Server action errors are handled by the existing form; accounts need no guest lock. */
export async function guestAwareAction<T>(guest: boolean, work: () => Promise<T>): Promise<T> {
  return guest ? withGuestCookieLock(work) : work();
}


/** Account-only browsers remain supported; guest entry itself requires Web Locks. */
export async function coordinateAccountSignIn<T>(work: () => Promise<T>): Promise<T> {
  return typeof navigator !== "undefined" && navigator.locks !== undefined ? withGuestCookieLock(work) : work();
}
