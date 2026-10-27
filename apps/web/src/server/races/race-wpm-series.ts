import {
  collectWpmObservation, createWpmSeries, freezeStoredWpmSeries, measuredElapsed,
  type EntrantResult, type Instant, type RaceState, type StoredWpmSeries, type WpmSeries,
} from "@incision/domain";

/** In-memory only. No scheduling, reduction, SQL, lease checks or broadcast. */
export class RaceWpmSeries {
  readonly #series = new Map<string, WpmSeries>();

  capture(state: RaceState, now: Instant): void {
    if (state.phase === "interrupted") return;
    for (const entrant of state.entrants) {
      const previous = this.#series.get(entrant.entrantId) ?? createWpmSeries();
      if (previous.finalized || (state.phase === "countdown" && entrant.status === "racing")) continue;
      const result = collectWpmObservation(previous, {
        elapsed: measuredElapsed(state.startsAt, now, entrant.endedAt),
        counters: entrant.counters,
        kind: entrant.status === "racing" ? "observe" : "finalize",
      });
      if (!result.ok) throw new RangeError(`WPM collection refused: ${result.refusal}`);
      this.#series.set(entrant.entrantId, result.series);
    }
  }

  freeze(result: EntrantResult): StoredWpmSeries {
    const series = this.#series.get(result.entrantId);
    if (series === undefined) throw new RangeError("Missing terminal WPM series");
    const frozen = freezeStoredWpmSeries(series, { elapsed: result.elapsed, counters: result.counters });
    if (!frozen.ok) throw new RangeError(`WPM freeze refused: ${frozen.refusal}`);
    return frozen.value;
  }
}
