import { describe, expect, it } from "vitest";
import { computeMeasures } from "../measures/compute";
import { MAX_ENTRANT_INSERTS } from "../race/limits";
import { asDuration, MAX_DURATION_MS, type Duration } from "../time";
import {
  collectWpmObservation, createWpmSeries, MAX_WPM_SERIES_POINTS,
  type WpmSeries, type WpmSeriesResult,
} from "./wpm-series";

function observation(elapsed: number, totalInserts = 0, correctInserts = totalInserts) {
  return { elapsed: asDuration(elapsed), counters: { totalInserts, correctInserts }, kind: "observe" as const };
}

function accepted(result: WpmSeriesResult): WpmSeries {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal);
  return result.series;
}

describe("bounded cumulative WPM observations (F-07.1a)", () => {
  it("starts empty rather than inventing a zero observation", () => {
    expect(createWpmSeries()).toEqual({ points: [], latest: null, spacingMs: 1000, finalized: false });
    const series = accepted(collectWpmObservation(createWpmSeries(), observation(60_000, 300, 250)));
    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.measures).toEqual({ netWpm: 50, rawWpm: 60, accuracy: 250 / 3 });
    expect(series.points[0]?.elapsed).toBe(60_000);
  });

  it("retains exact, uncapped cumulative measures, including a start burst", () => {
    const series = accepted(collectWpmObservation(createWpmSeries(), observation(1, 23, 7)));
    expect(series.points[0]?.measures).toEqual(computeMeasures({ totalInserts: 23, correctInserts: 7 }, asDuration(1)));
    expect(series.points[0]?.measures.rawWpm).toBe(276_000);
  });

  it("uses actual observations with inclusive spacing and no backfill", () => {
    let series = accepted(collectWpmObservation(createWpmSeries(), observation(0)));
    series = accepted(collectWpmObservation(series, observation(999, 4)));
    expect(series.points.map((point) => point.elapsed)).toEqual([0]);
    expect(series.latest?.counters.totalInserts).toBe(4);
    series = accepted(collectWpmObservation(series, observation(1000, 5)));
    series = accepted(collectWpmObservation(series, observation(10_777, 30)));
    expect(series.points.map((point) => point.elapsed)).toEqual([0, 1000, 10_777]);
  });

  it("validates against the latest skipped observation, not only retained points", () => {
    let series = accepted(collectWpmObservation(createWpmSeries(), observation(0)));
    series = accepted(collectWpmObservation(series, observation(900, 9, 7)));
    for (const [input, refusal] of [
      [observation(800, 9, 7), "TIME_REGRESSION"],
      [observation(901, 8, 7), "COUNTER_REGRESSION"],
      [observation(901, 10, 6), "COUNTER_REGRESSION"],
      [observation(901, 10, 9), "COUNTER_REGRESSION"],
    ] as const) {
      expect(collectWpmObservation(series, input)).toEqual({ ok: false, series, refusal });
    }
  });

  it("replaces retained same-time data, while duplicate and skipped-time updates do not add points", () => {
    let series = accepted(collectWpmObservation(createWpmSeries(), observation(1000, 2, 1)));
    series = accepted(collectWpmObservation(series, observation(1000, 3, 2)));
    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.counters).toEqual({ totalInserts: 3, correctInserts: 2 });
    expect(accepted(collectWpmObservation(series, observation(1000, 3, 2)))).toBe(series);
    series = accepted(collectWpmObservation(series, observation(1100, 4, 3)));
    series = accepted(collectWpmObservation(series, observation(1100, 5, 4)));
    expect(series.points).toHaveLength(1);
    expect(series.latest?.counters.totalInserts).toBe(5);
  });

  it.each([0, 100, 1000])("finalises at %i ms, even inside the sampling spacing", (elapsed) => {
    const initial = accepted(collectWpmObservation(createWpmSeries(), observation(0)));
    const final = { ...observation(elapsed, elapsed === 0 ? 0 : 3, elapsed === 0 ? 0 : 2), kind: "finalize" as const };
    const series = accepted(collectWpmObservation(initial, final));
    expect(series.finalized).toBe(true);
    expect(series.points.at(-1)).toEqual(series.latest);
    expect(series.points.at(-1)?.elapsed).toBe(elapsed);
    expect(accepted(collectWpmObservation(series, final))).toBe(series);
    expect(collectWpmObservation(series, { ...final, kind: "observe" })).toEqual({ ok: false, series, refusal: "SERIES_FINALIZED" });
    expect(collectWpmObservation(series, { ...final, elapsed: asDuration(elapsed + 1) })).toEqual({ ok: false, series, refusal: "TERMINAL_CONFLICT" });
    expect(collectWpmObservation(series, { ...final, counters: { totalInserts: 4, correctInserts: 3 } })).toEqual({ ok: false, series, refusal: "TERMINAL_CONFLICT" });
  });

  it("finalises an empty collection, with no status-specific fabricated history", () => {
    const series = accepted(collectWpmObservation(createWpmSeries(), { ...observation(0), kind: "finalize" }));
    expect(series.points).toHaveLength(1);
    expect(series.points[0]?.measures).toEqual({ netWpm: 0, rawWpm: 0, accuracy: 0 });
  });

  it.each([
    { elapsed: -1 }, { elapsed: 0.5 }, { elapsed: NaN }, { elapsed: Infinity }, { elapsed: MAX_DURATION_MS + 1 },
    { counters: { totalInserts: -1, correctInserts: 0 } },
    { counters: { totalInserts: 1.5, correctInserts: 1 } },
    { counters: { totalInserts: 1, correctInserts: 2 } },
    { counters: { totalInserts: 1, correctInserts: NaN } },
    { counters: { totalInserts: MAX_ENTRANT_INSERTS + 1, correctInserts: 0 } },
  ])("rejects invalid arithmetic without changing state: %j", (override) => {
    const series = createWpmSeries();
    const input = { ...observation(0), ...override };
    const result = collectWpmObservation(series, { ...input, elapsed: input.elapsed as Duration });
    expect(result).toEqual({ ok: false, series, refusal: "INVALID_OBSERVATION" });
    expect(result.series).toBe(series);
  });

  it("accepts the maximum representable duration and counters without imposing a race limit", () => {
    const series = accepted(collectWpmObservation(createWpmSeries(), {
      ...observation(MAX_DURATION_MS, MAX_ENTRANT_INSERTS), kind: "finalize",
    }));
    expect(series.latest?.measures.netWpm).toBe(MAX_ENTRANT_INSERTS * 12_000 / MAX_DURATION_MS);
  });

  it("compresses only when needed, preserves endpoints and exposes doubled spacing", () => {
    let series = createWpmSeries();
    for (let i = 0; i < MAX_WPM_SERIES_POINTS; i++) {
      series = accepted(collectWpmObservation(series, observation(i * 1000, i)));
    }
    expect(series.points).toHaveLength(512);
    expect(series.spacingMs).toBe(1000);
    const terminal = observation(511_001, 512);
    series = accepted(collectWpmObservation(series, { ...terminal, kind: "finalize" }));
    expect(series.spacingMs).toBe(2000);
    expect(series.points).toHaveLength(257);
    expect(series.points[0]?.elapsed).toBe(0);
    expect(series.points.at(-1)).toEqual({
      elapsed: terminal.elapsed, counters: terminal.counters,
      measures: computeMeasures(terminal.counters, terminal.elapsed),
    });
  });

  it("bounds a long irregular series, retaining only real observations and deterministic values", () => {
    function replay() {
      let series = createWpmSeries();
      const inputs = new Map<number, ReturnType<typeof observation>>();
      for (let i = 0; i < 10_000; i++) {
        const input = observation(i * 1371, i * 3, i * 2);
        inputs.set(input.elapsed, input);
        series = accepted(collectWpmObservation(series, input));
        expect(series.points.length).toBeLessThanOrEqual(MAX_WPM_SERIES_POINTS);
      }
      const terminal = observation(14_000_007, 30_000, 20_000);
      inputs.set(terminal.elapsed, terminal);
      series = accepted(collectWpmObservation(series, { ...terminal, kind: "finalize" }));
      for (const point of series.points) {
        const original = inputs.get(point.elapsed);
        expect(original).toBeDefined();
        expect(point.counters).toEqual(original?.counters);
        expect(point.measures).toEqual(computeMeasures(point.counters, point.elapsed));
      }
      expect(series.points[0]?.elapsed).toBe(0);
      expect(series.points.at(-1)?.elapsed).toBe(terminal.elapsed);
      expect(series.spacingMs).toBeGreaterThan(1000);
      return series;
    }
    expect(replay()).toEqual(replay());
  });

  it("never mutates inputs or aliases the caller's counters", () => {
    const input = observation(0);
    const initial = Object.freeze({ ...createWpmSeries(), points: Object.freeze([]) });
    const series = accepted(collectWpmObservation(initial, input));
    input.counters.totalInserts = 5;
    expect(series.latest?.counters.totalInserts).toBe(0);
    Object.freeze(series.points);
    Object.freeze(series.latest?.counters);
    Object.freeze(series.latest);
    Object.freeze(series);
    const updated = accepted(collectWpmObservation(series, observation(1000, 4)));
    expect(series.points).toHaveLength(1);
    expect(updated.points).toHaveLength(2);
  });
});
