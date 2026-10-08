import { RACE_LEASE_MS } from "@incision/database";

/**
 * Timing of a race's ownership lease (ADR-0004). The database keeps the lease for `leaseMs`
 * after each renewal; the owner renews every `renewEveryMs`, so two missed renewals are
 * tolerated before another process may take the race over. Locally, the owner counts its
 * lease from the moment it *sent* the last confirmed renewal, minus a safety margin: it never
 * believes it holds the lease longer than the database does.
 */
export const LEASE_TIMING = {
  leaseMs: RACE_LEASE_MS,
  renewEveryMs: 10_000,
  safetyMarginMs: 5_000,
  /** While the database does not answer: one attempt at a time, this often. */
  retryEveryMs: 2_000,
  /** Suspended for this long without any confirmation, the owner gives the race up for good. */
  maxSuspensionMs: 60_000,
} as const;

export type LeaseTiming = { readonly [Name in keyof typeof LEASE_TIMING]: number };

/**
 * held: the runtime may accept keystrokes and broadcast authoritative state.
 * suspended: ownership is no longer guaranteed (no confirmation in time); nothing authoritative.
 * lost: the race ended elsewhere, was taken over or given up; terminal, never held again.
 * stopped: the owner released it (the race ended here); terminal.
 */
export type LeaseState = "held" | "suspended" | "lost" | "stopped";

/** Runs `callback` after `delayMs` and returns a function that cancels it. */
export type Schedule = (callback: () => void, delayMs: number) => () => void;

export type RaceLeaseOptions = {
  /**
   * Renews on the database for this owner and generation (`renewRaceLease`): true if renewed,
   * false if the race ended, was interrupted or taken over. Throws when the database is
   * unreachable.
   */
  readonly renew: () => Promise<boolean>;
  /** A monotonic clock in milliseconds (never the wall clock, which can jump). */
  readonly now: () => number;
  readonly schedule: Schedule;
  /** When the transaction that took the lease (the race's start) was sent. */
  readonly acquiredAt: number;
  readonly onChange?: (state: LeaseState) => void;
  readonly timing?: LeaseTiming;
};

/**
 * The owner's view of a race's lease. Its guarantees (ADR-0004):
 * - the runtime asks `isAuthoritative()` before accepting a keystroke batch or broadcasting;
 *   it is false as soon as the local deadline passes without a confirmed renewal;
 * - only a renewal confirmed by the database (same owner, same generation, race still active)
 *   brings a suspended lease back, and only up to what that renewal proves;
 * - once lost or stopped, nothing brings it back: a late or delayed answer is ignored;
 * - at most one renewal is in flight, and attempts are spaced and bounded in time;
 * - it wakes up at its deadlines, so `onChange` reports a suspension or a give-up on time.
 */
export class RaceLease {
  readonly #timing: LeaseTiming;
  #state: LeaseState = "held";
  /** Local monotonic deadline of the ownership this process can prove. */
  #validUntil: number;
  #inFlight = false;
  #suspendedSince: number | undefined;
  #cancelNext: (() => void) | undefined;

  constructor(private readonly options: RaceLeaseOptions) {
    this.#timing = options.timing ?? LEASE_TIMING;
    this.#validUntil = options.acquiredAt + this.#timing.leaseMs - this.#timing.safetyMarginMs;
  }

  get state(): LeaseState {
    this.#checkDeadline();
    return this.#state;
  }

  /** Whether the runtime may act for this race now (accept keystrokes, broadcast, finalise). */
  isAuthoritative(): boolean {
    return this.state === "held";
  }

  /** Starts the renewals. */
  start(): void {
    this.#scheduleNext(this.#timing.renewEveryMs);
  }

  /** The race ended in this process: no more renewals, and no answer changes anything. */
  stop(): void {
    this.#finish("stopped");
  }

  #checkDeadline(): void {
    if (this.#state === "held" && this.options.now() >= this.#validUntil) {
      this.#suspendedSince = this.options.now();
      this.#change("suspended");
    }
  }

  #tick(): void {
    this.#cancelNext = undefined;
    this.#checkDeadline();
    if (this.#state === "lost" || this.#state === "stopped") {
      return;
    }
    if (this.#state === "suspended" && this.options.now() - (this.#suspendedSince ?? this.options.now()) >= this.#timing.maxSuspensionMs) {
      this.#finish("lost");
      return;
    }
    // A renewal that never answers must not freeze the lease: keep checking, without a second one.
    this.#scheduleNext(this.#timing.retryEveryMs);
    if (this.#inFlight) {
      return;
    }
    const sentAt = this.options.now();
    this.#inFlight = true;
    this.options.renew().then(
      (renewed) => this.#settle(() => (renewed ? this.#confirmed(sentAt) : this.#finish("lost"))),
      () => this.#settle(() => undefined),
    );
  }

  #settle(handle: () => void): void {
    this.#inFlight = false;
    // A terminal lease ignores every answer, late or not.
    if (this.#state === "lost" || this.#state === "stopped") {
      return;
    }
    handle();
    this.#checkDeadline();
    if (this.#state === "held" || this.#state === "suspended") {
      this.#scheduleNext(this.#state === "held" ? this.#timing.renewEveryMs : this.#timing.retryEveryMs);
    }
  }

  /** Proves ownership up to what this renewal shows, never beyond: an old answer proves little. */
  #confirmed(sentAt: number): void {
    this.#validUntil = Math.max(this.#validUntil, sentAt + this.#timing.leaseMs - this.#timing.safetyMarginMs);
    if (this.#state === "suspended" && this.options.now() < this.#validUntil) {
      this.#suspendedSince = undefined;
      this.#change("held");
    }
  }

  /** The next tick, or earlier if the local deadline or the give-up comes first. */
  #scheduleNext(delayMs: number): void {
    this.#cancelNext?.();
    const now = this.options.now();
    const deadline =
      this.#state === "held" ? this.#validUntil : (this.#suspendedSince ?? now) + this.#timing.maxSuspensionMs;
    this.#cancelNext = this.options.schedule(() => this.#tick(), Math.max(0, Math.min(delayMs, deadline - now)));
  }

  #finish(state: "lost" | "stopped"): void {
    if (this.#state === "lost" || this.#state === "stopped") {
      return;
    }
    this.#cancelNext?.();
    this.#cancelNext = undefined;
    this.#change(state);
  }

  #change(state: LeaseState): void {
    this.#state = state;
    this.options.onChange?.(state);
  }
}
