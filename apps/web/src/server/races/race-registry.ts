import type { RaceOwnership } from "@incision/database";

/** A race this process runs: its ownership (ADR-0004) and what keeps its lease. */
export type OwnedRace = {
  readonly ownership: RaceOwnership;
  /** Stopping it ends the renewals for good (`RaceLease.stop`). */
  readonly lease: { readonly stop: () => void };
};

export type StopOptions = {
  /** The owner's own interruption (`interruptOwnRace(…, "server_stopped")`); true when it won. */
  readonly interrupt: (ownership: RaceOwnership) => Promise<boolean>;
  /** Told about each room whose race was interrupted, so its members learn it. */
  readonly onInterrupted: (lobbyId: string) => void;
  /** The interruptions run at once and are not awaited beyond this, within the shutdown grace. */
  readonly timeoutMs: number;
};

/**
 * The races this process runs, one per room (F-04.0, ADR-0004). When the process stops it
 * refuses new races, then interrupts its own ones through the fenced write: a race it cannot
 * interrupt in time is left to its lease, which another process recovers once it expires.
 */
export class RaceRegistry {
  readonly #races = new Map<string, OwnedRace>();
  #stopping = false;

  get stopping(): boolean {
    return this.#stopping;
  }

  /** False once the process is stopping: no race may start then. */
  add(race: OwnedRace): boolean {
    if (this.#stopping) {
      return false;
    }
    this.#races.set(race.ownership.lobbyId, race);
    return true;
  }

  /** The race of `lobbyId` ended here (finished, interrupted, or its lease lost). */
  remove(lobbyId: string): void {
    this.#races.get(lobbyId)?.lease.stop();
    this.#races.delete(lobbyId);
  }

  ownsRace(lobbyId: string): boolean {
    return this.#races.has(lobbyId);
  }

  /**
   * `interrupted`: races given back through the fenced write; `left`: races left to their lease
   * (lost to another writer, failed, or not done when the time ran out).
   */
  async stop({ interrupt, onInterrupted, timeoutMs }: StopOptions): Promise<{ readonly interrupted: number; readonly left: number; readonly timedOut: boolean }> {
    this.#stopping = true;
    const owned = [...this.#races.values()];
    this.#races.clear();
    let interrupted = 0;
    const attempts = owned.map(async ({ ownership, lease }) => {
      lease.stop();
      try {
        if (await interrupt(ownership)) {
          interrupted += 1;
          onInterrupted(ownership.lobbyId);
        }
      } catch {
        // Left to its lease: another process recovers it once the lease expires.
      }
    });
    let timer: NodeJS.Timeout | undefined;
    const settled = await Promise.race([
      Promise.allSettled(attempts).then(() => true),
      new Promise<false>((resolve) => {
        timer = setTimeout(() => resolve(false), timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    return { interrupted, left: owned.length - interrupted, timedOut: !settled };
  }
}

// Next bundles server actions separately from the custom server: one registry per process.
const processGlobal = globalThis as typeof globalThis & { incisionRaceRegistry?: RaceRegistry };

export function getRaceRegistry(): RaceRegistry {
  processGlobal.incisionRaceRegistry ??= new RaceRegistry();
  return processGlobal.incisionRaceRegistry;
}
