import type { RaceOwnership } from "@incision/database";

/** How a race ended when its process stopped. */
export type ShutdownOutcome =
  /** Its frozen results were saved (`finalizeRace` won or had already). */
  | "finalised"
  /** Interrupted through the fenced write (`interruptOwnRace`, `server_stopped`). */
  | "interrupted"
  /** Neither in time: left to its lease, which another process recovers once it expires. */
  | "left";

/** A race this process runs (ADR-0004), as its runtime registers it. */
export type OwnedRace = {
  readonly ownership: RaceOwnership;
  /** Stopping it ends the renewals for good (`RaceLease.stop`). */
  readonly lease: { readonly stop: () => void };
  /**
   * Ends the race for a stopping process. The runtime decides how: a race whose results are
   * frozen may get one attempt to save them before it is interrupted.
   */
  readonly shutdown: () => Promise<ShutdownOutcome>;
};

export type StopOptions = {
  /** Told about each room whose race was finalised or interrupted, so its members learn it. */
  readonly onEnded: (lobbyId: string, outcome: Exclude<ShutdownOutcome, "left">) => void;
  /** The shutdowns run at once and are not awaited beyond this, within the process's grace. */
  readonly timeoutMs: number;
};

export type StopReport = { readonly finalised: number; readonly interrupted: number; readonly left: number; readonly timedOut: boolean };

/**
 * The races this process runs, one per room (F-04.0, ADR-0004). The start path checks
 * `stopping` before it starts a race, and a race `add` refuses (the process began stopping in
 * between) is interrupted by its starter. When the process stops, every race ends through its
 * own shutdown; a race stays registered until that settles, so it is never recovered here as
 * an abandoned one meanwhile.
 */
export class RaceRegistry {
  readonly #races = new Map<string, OwnedRace>();
  #stopping = false;

  get stopping(): boolean {
    return this.#stopping;
  }

  /**
   * False once the process is stopping. A room runs one race at a time: a race still
   * registered for the room is stale (the committed start proves it is no longer the room's
   * current one), so its lease stops and the new race replaces it.
   */
  add(race: OwnedRace): boolean {
    if (this.#stopping) {
      return false;
    }
    const current = this.#races.get(race.ownership.lobbyId);
    if (current !== undefined && current.ownership.raceId !== race.ownership.raceId) {
      current.lease.stop();
    }
    this.#races.set(race.ownership.lobbyId, race);
    return true;
  }

  /** The race ended here (finished, interrupted, or its lease lost); another race of the room is kept. */
  remove({ lobbyId, raceId }: Pick<RaceOwnership, "lobbyId" | "raceId">): void {
    const current = this.#races.get(lobbyId);
    if (current?.ownership.raceId === raceId) {
      current.lease.stop();
      this.#races.delete(lobbyId);
    }
  }

  ownsRace(lobbyId: string): boolean {
    return this.#races.has(lobbyId);
  }

  async stop({ onEnded, timeoutMs }: StopOptions): Promise<StopReport> {
    this.#stopping = true;
    const counts = { finalised: 0, interrupted: 0 };
    const owned = [...this.#races.values()];
    const attempts = owned.map(async (race) => {
      let outcome: ShutdownOutcome = "left";
      try {
        outcome = await race.shutdown();
      } catch {
        // Left to its lease.
      } finally {
        this.remove(race.ownership);
      }
      if (outcome !== "left") {
        counts[outcome] += 1;
        onEnded(race.ownership.lobbyId, outcome);
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
    if (!settled) {
      // Still registered (so never recovered here), but no renewal from a process about to exit.
      for (const race of this.#races.values()) {
        race.lease.stop();
      }
    }
    return { ...counts, left: owned.length - counts.finalised - counts.interrupted, timedOut: !settled };
  }
}

// Next bundles server actions separately from the custom server: one registry per process.
const processGlobal = globalThis as typeof globalThis & { incisionRaceRegistry?: RaceRegistry };

export function getRaceRegistry(): RaceRegistry {
  processGlobal.incisionRaceRegistry ??= new RaceRegistry();
  return processGlobal.incisionRaceRegistry;
}
