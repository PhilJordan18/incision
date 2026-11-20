import { z } from "zod";

const replySchema = z.object({ ok: z.literal(true), serverTime: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).strict();
const SAMPLE_LIFETIME_MS = 120_000;
const PROBE_TIMEOUT_MS = 5_000;

type Sample = { received: number; roundTrip: number; serverAtReceipt: number };
type Options = {
  readonly now: () => number;
  readonly monotonic: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
  readonly changed: () => void;
};

/** Display-only server clock. Neither these probes nor client timestamps authorize a race action. */
export class ClockSync {
  readonly #options: Options;
  #samples: Sample[] = [];
  #best: Sample | undefined;
  #fallbackOffset = 0;
  #generation = 0;
  #cancel: (() => void) | undefined;

  constructor(options: Options) {
    this.#options = options;
  }

  now(): number {
    const best = this.#best;
    return best === undefined
      ? this.#options.now() + this.#fallbackOffset
      : best.serverAtReceipt + this.#options.monotonic() - best.received;
  }

  /** Reveal/progress timestamps are a conservative fallback, never a replacement for RTT. */
  observe(serverNow: number): void {
    if (this.#best === undefined) this.#fallbackOffset = serverNow - this.#options.now();
  }

  start(ping: (sentAt: number) => Promise<unknown>): void {
    this.stop();
    const generation = this.#generation;
    this.#samples = [];
    // Retain the last estimate until a fresh probe succeeds, including during reconnect.
    void this.#probe({ ping, generation, attempt: 0 });
  }

  stop(): void {
    this.#generation += 1;
    this.#cancel?.();
    this.#cancel = undefined;
  }

  async #probe(context: { ping: (sentAt: number) => Promise<unknown>; generation: number; attempt: number }): Promise<void> {
    const { ping, generation, attempt } = context;
    const sent = this.#options.monotonic();
    let cancelTimeout: (() => void) | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        cancelTimeout = this.#options.schedule(() => reject(new Error("clock timeout")), PROBE_TIMEOUT_MS);
        this.#cancel = () => { cancelTimeout?.(); reject(new Error("clock stopped")); };
      });
      const answer = replySchema.safeParse(await Promise.race([ping(this.#options.now()), timeout]));
      if (generation !== this.#generation) return;
      const received = this.#options.monotonic();
      const roundTrip = received - sent;
      if (!answer.success || !Number.isFinite(roundTrip) || roundTrip < 0 || roundTrip >= PROBE_TIMEOUT_MS) return;
      // Midpoint approximation: asymmetric paths can still bias the estimate by half their difference.
      const sample = { received, roundTrip, serverAtReceipt: answer.data.serverTime + roundTrip / 2 };
      this.#samples = this.#samples.filter((value) => received - value.received < SAMPLE_LIFETIME_MS).slice(-7);
      this.#samples.push(sample);
      this.#best = this.#samples.reduce((best, value) => value.roundTrip <= best.roundTrip ? value : best);
      this.#options.changed();
    } catch {
      // A missing/invalid reply never takes away a usable clock or blocks watching the room.
    } finally {
      cancelTimeout?.();
      if (generation === this.#generation) {
        this.#cancel = this.#options.schedule(() => {
          void this.#probe({ ping, generation, attempt: attempt + 1 });
        }, attempt < 2 ? 250 : 30_000);
      }
    }
  }
}
