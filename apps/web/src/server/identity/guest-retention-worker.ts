import type { GuestRetentionReport } from "@incision/database";
import type { Schedule } from "../races/race-lease";

/** Single-process bounded batches, no overlap, no activity renewal or remote scheduler. */
export class GuestRetentionWorker {
  #stopped = false;
  #cancel: (() => void) | undefined;
  constructor(readonly options: {
    readonly run: () => Promise<GuestRetentionReport>;
    readonly committed: (report: GuestRetentionReport) => void;
    readonly failed: () => void;
    readonly schedule: Schedule;
  }) { void this.#run(); }

  async #run(): Promise<void> {
    if (this.#stopped) return;
    try { this.options.committed(await this.options.run()); }
    catch { this.options.failed(); }
    finally {
      if (!this.#stopped) this.#cancel = this.options.schedule(() => void this.#run(), 30_000);
    }
  }
  stop(): void { this.#stopped = true; this.#cancel?.(); }
}
