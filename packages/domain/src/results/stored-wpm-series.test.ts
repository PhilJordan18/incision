import { describe, expect, it } from "vitest";
import { computeMeasures } from "../measures/compute";
import { MAX_ENTRANT_INSERTS } from "../race/limits";
import { asDuration, MAX_DURATION_MS } from "../time";
import {
  decodeStoredWpmSeries, freezeStoredWpmSeries,
  type StoredWpmSeriesResult,
} from "./stored-wpm-series";
import {
  collectWpmObservation, createWpmSeries, MAX_WPM_SERIES_POINTS,
  type WpmObservation, type WpmSeries,
} from "./wpm-series";

function observation(elapsed: number, totalInserts = 0, correctInserts = totalInserts): WpmObservation {
  return { elapsed: asDuration(elapsed), counters: { totalInserts, correctInserts } };
}

function sample(input: WpmObservation) {
  return { ...input, measures: computeMeasures(input.counters, input.elapsed) };
}

function accepted(result: StoredWpmSeriesResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.refusal);
  return result.value;
}

function collected(inputs: readonly WpmObservation[]): WpmSeries {
  let series = createWpmSeries();
  for (const [index, input] of inputs.entries()) {
    const result = collectWpmObservation(series, {
      ...input, kind: index === inputs.length - 1 ? "finalize" : "observe",
    });
    if (!result.ok) throw new Error(result.refusal);
    series = result.series;
  }
  return series;
}

const terminal = observation(60_000, 300, 250);
function payload() {
  return {
    version: 1, spacingMs: 1000,
    points: [sample(observation(0)), sample(observation(1000, 6, 5)), sample(terminal)],
  };
}

describe("versioned stored WPM series (F-07.1b)", () => {
  it("round-trips exact cumulative values through JSON without inventing skipped points", () => {
    const series = collected([observation(0), observation(1000, 6, 5), terminal]);
    const frozen = accepted(freezeStoredWpmSeries(series, terminal));
    expect(frozen).toEqual(payload());
    expect(frozen.points.at(-1)?.measures).toEqual({ netWpm: 50, rawWpm: 60, accuracy: 250 / 3 });
    expect(accepted(decodeStoredWpmSeries(JSON.parse(JSON.stringify(frozen)), terminal))).toEqual(frozen);
  });

  it("returns a deeply frozen copy detached from mutable inputs for identical SQL retries", () => {
    const input = payload();
    const frozen = accepted(decodeStoredWpmSeries(input, terminal));
    expect(Object.isFrozen(frozen)).toBe(true);
    expect(Object.isFrozen(frozen.points)).toBe(true);
    for (const point of frozen.points) {
      expect(Object.isFrozen(point)).toBe(true);
      expect(Object.isFrozen(point.counters)).toBe(true);
      expect(Object.isFrozen(point.measures)).toBe(true);
    }
    Object.assign(input.points[1]!.counters, { totalInserts: 999 });
    Object.assign(input.points[1]!.measures, { netWpm: 999 });
    input.points.splice(0);
    expect(frozen).toEqual(payload());
  });

  it("does not finalise a running collector or accept mismatched collector latest state", () => {
    expect(freezeStoredWpmSeries(createWpmSeries(), terminal)).toEqual({ ok: false, refusal: "NOT_FINALIZED" });
    const series = collected([observation(0), terminal]);
    for (const latest of [null, sample(observation(59_999, 300, 250)), {
      ...sample(terminal), measures: { netWpm: 0, rawWpm: 0, accuracy: 0 },
    }]) {
      expect(freezeStoredWpmSeries({ ...series, latest }, terminal)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
    }
  });

  it("accepts terminal-only zero, sub-second, maximum and burst observations without caps", () => {
    for (const end of [
      observation(0), observation(1, 23, 7), observation(123, 4, 3),
      observation(MAX_DURATION_MS, MAX_ENTRANT_INSERTS),
    ]) {
      const stored = accepted(freezeStoredWpmSeries(collected([end]), end));
      expect(stored.points).toEqual([sample(end)]);
      expect(accepted(decodeStoredWpmSeries(JSON.parse(JSON.stringify(stored)), end))).toEqual(stored);
    }
  });

  it("accepts the last short interval and a compressed long series produced by the real collector", () => {
    const inputs = Array.from({ length: 1025 }, (_, index) => observation(index * 1000, index));
    const end = observation(1_024_001, 1025);
    const stored = accepted(freezeStoredWpmSeries(collected([...inputs, end]), end));
    expect(stored.spacingMs).toBeGreaterThan(1000);
    expect(stored.points.length).toBeLessThanOrEqual(MAX_WPM_SERIES_POINTS);
    expect(stored.points[0]).toEqual(sample(inputs[0]!));
    expect(stored.points.at(-1)).toEqual(sample(end));
  });

  it("accepts exactly 512 points but refuses an empty or overflowing series", () => {
    const inputs = Array.from({ length: 512 }, (_, index) => observation(index * 1000, index));
    const end = inputs.at(-1)!;
    expect(accepted(freezeStoredWpmSeries(collected(inputs), end)).points).toHaveLength(512);
    for (const points of [[], [...inputs, observation(512_000, 512)].map(sample)]) {
      expect(decodeStoredWpmSeries({ ...payload(), points }, end)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
    }
  });

  it("refuses absence, nonobjects and unknown versions rather than manufacturing an empty series", () => {
    for (const value of [null, undefined, [], "", 0]) {
      expect(decodeStoredWpmSeries(value, terminal)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
    }
    for (const version of [undefined, 0, 2, "1"]) {
      expect(decodeStoredWpmSeries({ ...payload(), version }, terminal)).toEqual({ ok: false, refusal: "UNSUPPORTED_VERSION" });
    }
  });

  it("refuses invalid spacing and accepts only bounded doublings of the collector resolution", () => {
    for (const spacingMs of [0, -1000, 999, 1000.5, 3000, NaN, Infinity, Number.MAX_SAFE_INTEGER]) {
      expect(decodeStoredWpmSeries({ ...payload(), spacingMs }, terminal)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
    }
    expect(accepted(decodeStoredWpmSeries({ version: 1, spacingMs: 2000, points: [sample(terminal)] }, terminal)).spacingMs).toBe(2000);
  });

  it("refuses every extra field, including data which must not be persisted in a series", () => {
    for (const input of [
      { ...payload(), accountId: "private" },
      { ...payload(), points: [{ ...sample(terminal), text: "private" }] },
      { ...payload(), points: [{ ...sample(terminal), counters: { ...terminal.counters, session: "private" } }] },
      { ...payload(), points: [{ ...sample(terminal), measures: { ...sample(terminal).measures, seed: 42 } }] },
    ]) expect(decodeStoredWpmSeries(input, terminal)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
  });

  it("refuses malformed arithmetic and rounded or corrupted measures", () => {
    const end = sample(terminal);
    for (const point of [
      { ...end, elapsed: -1 }, { ...end, elapsed: 0.5 }, { ...end, elapsed: MAX_DURATION_MS + 1 },
      { ...end, counters: { totalInserts: 3, correctInserts: 4 } },
      { ...end, counters: { totalInserts: MAX_ENTRANT_INSERTS + 1, correctInserts: 0 } },
      { ...end, counters: { totalInserts: 3.5, correctInserts: 0 } },
      { ...end, counters: { totalInserts: 300, correctInserts: NaN } },
      { ...end, measures: { ...end.measures, accuracy: 83.33 } },
      { ...end, measures: { ...end.measures, netWpm: 49 } },
      { ...end, measures: { ...end.measures, rawWpm: Infinity } },
      { ...end, measures: null }, { ...end, counters: null }, { ...end, elapsed: "60000" },
    ]) expect(decodeStoredWpmSeries({ ...payload(), points: [point] }, terminal)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
  });

  it("refuses duplicate/reversed time, declining counters and too-short interior intervals", () => {
    for (const middle of [
      observation(1000, 11, 8), observation(999, 11, 8), observation(1500, 11, 8),
      observation(2000, 9, 7), observation(2000, 11, 6), observation(2000, 11, 9),
    ]) {
      const points = [sample(observation(1000, 10, 7)), sample(middle), sample(terminal)];
      expect(decodeStoredWpmSeries({ ...payload(), points }, terminal)).toEqual({ ok: false, refusal: "INVALID_SERIES" });
    }
  });

  it("ties the terminal sample to the saved result, including zero and positive counters", () => {
    for (const expected of [observation(59_999, 300, 250), observation(60_000, 301, 250), observation(60_000, 300, 251)]) {
      expect(decodeStoredWpmSeries(payload(), expected)).toEqual({ ok: false, refusal: "FINAL_SAMPLE_MISMATCH" });
    }
    expect(decodeStoredWpmSeries(payload(), observation(60_000, 1, 2))).toEqual({ ok: false, refusal: "INVALID_TERMINAL" });
  });
});
