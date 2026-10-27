import { computeMeasures } from "../measures/compute";
import { asDuration, MAX_DURATION_MS } from "../time";
import {
  INITIAL_WPM_SERIES_SPACING_MS, MAX_WPM_SERIES_POINTS,
  type WpmObservation, type WpmSample, type WpmSeries,
} from "./wpm-series";

/** Version 1 stores actual cumulative observations, never reconstructed or rounded values. */
export type StoredWpmSeries = {
  readonly version: 1;
  readonly spacingMs: number;
  readonly points: readonly WpmSample[];
};

export type StoredWpmSeriesRefusal =
  | "NOT_FINALIZED"
  | "UNSUPPORTED_VERSION"
  | "INVALID_SERIES"
  | "INVALID_TERMINAL"
  | "FINAL_SAMPLE_MISMATCH";

export type StoredWpmSeriesResult =
  | { readonly ok: true; readonly value: StoredWpmSeries }
  | { readonly ok: false; readonly refusal: StoredWpmSeriesRefusal };

/**
 * Validate a JSON-shaped storage value against the result's authoritative terminal counters.
 * An absent historical row is handled by the reader, NOT by passing null here: malformed or
 * unsupported data must never be silently reported as an empty or unavailable series.
 * The returned deep-frozen copy contains no identifiers, text, or collector-only state.
 */
export function decodeStoredWpmSeries(
  input: unknown,
  terminal: WpmObservation,
): StoredWpmSeriesResult {
  const expected = readObservation(terminal);
  if (!expected) return refused("INVALID_TERMINAL");
  if (!record(input)) return refused("INVALID_SERIES");
  if (input.version !== 1) return refused("UNSUPPORTED_VERSION");
  if (
    !keysAre(input, ["version", "spacingMs", "points"]) ||
    !validSpacing(input.spacingMs) || !Array.isArray(input.points) ||
    input.points.length === 0 || input.points.length > MAX_WPM_SERIES_POINTS
  ) return refused("INVALID_SERIES");

  const points: WpmSample[] = [];
  for (let index = 0; index < input.points.length; index++) {
    const point = readSample(input.points[index]);
    if (!point) return refused("INVALID_SERIES");
    const previous = points.at(-1);
    if (previous && (
      point.elapsed <= previous.elapsed ||
      point.counters.correctInserts < previous.counters.correctInserts ||
      point.counters.totalInserts < previous.counters.totalInserts ||
      wrongInserts(point) < wrongInserts(previous) ||
      // Only the terminal interval may be shorter than the retained resolution.
      (index < input.points.length - 1 && point.elapsed - previous.elapsed < input.spacingMs)
    )) return refused("INVALID_SERIES");
    points.push(point);
  }
  const last = points.at(-1);
  if (!last || !sameObservation(last, expected)) return refused("FINAL_SAMPLE_MISMATCH");
  return {
    ok: true,
    value: Object.freeze({ version: 1, spacingMs: input.spacingMs, points: Object.freeze(points) }),
  };
}

/** Freeze once before SQL retries. Does not finalise a running collector or fabricate samples. */
export function freezeStoredWpmSeries(
  series: WpmSeries,
  terminal: WpmObservation,
): StoredWpmSeriesResult {
  if (series.finalized !== true) return refused("NOT_FINALIZED");
  const result = decodeStoredWpmSeries({
    version: 1, spacingMs: series.spacingMs, points: series.points,
  }, terminal);
  if (!result.ok) return result;
  const latest = readSample(series.latest);
  const last = result.value.points.at(-1);
  if (!latest || !last || !sameObservation(latest, last)) return refused("INVALID_SERIES");
  return result;
}

function readSample(input: unknown): WpmSample | null {
  if (!record(input) || !keysAre(input, ["elapsed", "counters", "measures"])) return null;
  const observation = readObservation({ elapsed: input.elapsed, counters: input.counters });
  if (!observation || !record(input.measures) ||
    !keysAre(input.measures, ["netWpm", "rawWpm", "accuracy"])) return null;
  const measures = computeMeasures(observation.counters, observation.elapsed);
  if (
    input.measures.netWpm !== measures.netWpm ||
    input.measures.rawWpm !== measures.rawWpm ||
    input.measures.accuracy !== measures.accuracy
  ) return null;
  return Object.freeze({ ...observation, measures: Object.freeze(measures) });
}

function readObservation(input: unknown): WpmObservation | null {
  if (!record(input) || !keysAre(input, ["elapsed", "counters"]) ||
    typeof input.elapsed !== "number" || !record(input.counters) ||
    !keysAre(input.counters, ["totalInserts", "correctInserts"]) ||
    typeof input.counters.totalInserts !== "number" ||
    typeof input.counters.correctInserts !== "number") return null;
  try {
    const elapsed = asDuration(input.elapsed);
    const counters = {
      totalInserts: input.counters.totalInserts,
      correctInserts: input.counters.correctInserts,
    };
    // Reuse the engine's arithmetic bounds, including maximum cumulative counters.
    computeMeasures(counters, elapsed);
    return Object.freeze({ elapsed, counters: Object.freeze(counters) });
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function validSpacing(value: unknown): value is number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) return false;
  const ratio = value / INITIAL_WPM_SERIES_SPACING_MS;
  // The collector doubles spacing only; no 32-bit bitwise power-of-two test for long races.
  return ratio >= 1 && Number.isInteger(Math.log2(ratio)) && value <= MAX_DURATION_MS * 2;
}

function wrongInserts(sample: WpmObservation): number {
  return sample.counters.totalInserts - sample.counters.correctInserts;
}

function sameObservation(a: WpmObservation, b: WpmObservation): boolean {
  return a.elapsed === b.elapsed && a.counters.totalInserts === b.counters.totalInserts &&
    a.counters.correctInserts === b.counters.correctInserts;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function keysAre(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function refused(refusal: StoredWpmSeriesRefusal): StoredWpmSeriesResult {
  return { ok: false, refusal };
}
