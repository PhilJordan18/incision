import { computeMeasures } from "../measures/compute";
import type { Measures, TypingCounters } from "../measures/types";
import type { Duration } from "../time";

export const MAX_WPM_SERIES_POINTS = 512;
export const INITIAL_WPM_SERIES_SPACING_MS = 1_000;

export type WpmObservation = {
  readonly elapsed: Duration;
  readonly counters: TypingCounters;
};

/** Cumulative (not instantaneous) measures, exact and unrounded. */
export type WpmSample = WpmObservation & { readonly measures: Measures };

/**
 * Internal server-owned state, created here, not a wire or database hydration contract.
 * No account, session, typed text or guest identifier is captured (D-08).
 * `latest` includes accepted observations skipped by the sampling cadence: validation must
 * compare against it, not merely the last retained point. All returned data is readonly.
 */
export type WpmSeries = {
  readonly points: readonly WpmSample[];
  readonly latest: WpmSample | null;
  readonly spacingMs: number;
  readonly finalized: boolean;
};

export type WpmSeriesRefusal =
  | "INVALID_OBSERVATION"
  | "TIME_REGRESSION"
  | "COUNTER_REGRESSION"
  | "SERIES_FINALIZED"
  | "TERMINAL_CONFLICT";

export type WpmSeriesResult =
  | { readonly ok: true; readonly series: WpmSeries }
  | { readonly ok: false; readonly series: WpmSeries; readonly refusal: WpmSeriesRefusal };

export function createWpmSeries(): WpmSeries {
  return { points: [], latest: null, spacingMs: INITIAL_WPM_SERIES_SPACING_MS, finalized: false };
}

/**
 * Caller supplies authoritative post-validation counters and the engine's measured elapsed
 * time, never client timestamps. Call at the start to retain a genuine zero observation,
 * periodically during the race, and with `finalize` at the exact terminal elapsed time.
 * This module schedules nothing and neither persists nor publishes the collected series.
 *
 * Sparse calls are recorded at their real time, never backfilled. Same-time increasing
 * counters replace that time's retained sample (or just `latest` if it was not sampled).
 * Finalisation bypasses cadence for every terminal status, including countdown abandonment.
 * Identical finalisation is idempotent; any later observation is refused.
 *
 * At most 512 points are retained. On overflow the spacing doubles and a subset of actual
 * observations is retained, always preserving first and last. No averages, interpolation,
 * WPM caps or synthetic points. Consumers must carry `spacingMs` to describe reduced
 * resolution; the last/terminal interval may be shorter. This never limits race duration.
 */
export function collectWpmObservation(
  series: WpmSeries,
  input: WpmObservation & { readonly kind: "observe" | "finalize" },
): WpmSeriesResult {
  const sample = checkedSample(input);
  if (!sample || (input.kind !== "observe" && input.kind !== "finalize")) {
    return refused(series, "INVALID_OBSERVATION");
  }
  const latest = series.latest;
  if (series.finalized) {
    if (input.kind === "observe") return refused(series, "SERIES_FINALIZED");
    return latest && sameObservation(latest, sample)
      ? { ok: true, series }
      : refused(series, "TERMINAL_CONFLICT");
  }
  if (latest) {
    if (sample.elapsed < latest.elapsed) return refused(series, "TIME_REGRESSION");
    // Correct and wrong insert totals are both cumulative, even after correction (D-09).
    if (
      sample.counters.totalInserts < latest.counters.totalInserts ||
      sample.counters.correctInserts < latest.counters.correctInserts ||
      sample.counters.totalInserts - sample.counters.correctInserts <
        latest.counters.totalInserts - latest.counters.correctInserts
    ) return refused(series, "COUNTER_REGRESSION");
    if (input.kind === "observe" && sameObservation(latest, sample)) return { ok: true, series };
  }

  const last = series.points.at(-1);
  let points = series.points;
  const finalized = input.kind === "finalize";
  if (last?.elapsed === sample.elapsed) {
    points = [...points.slice(0, -1), sample];
  } else if (!last || finalized || sample.elapsed - last.elapsed >= series.spacingMs) {
    points = [...points, sample];
  }

  let spacingMs = series.spacingMs;
  while (points.length > MAX_WPM_SERIES_POINTS) {
    spacingMs *= 2;
    points = coarsen(points, spacingMs);
  }
  return { ok: true, series: { points, latest: sample, spacingMs, finalized } };
}

function checkedSample(input: WpmObservation): WpmSample | null {
  try {
    const measures = computeMeasures(input.counters, input.elapsed);
    return {
      elapsed: input.elapsed,
      counters: { ...input.counters },
      measures,
    };
  } catch (error) {
    if (error instanceof RangeError) return null;
    throw error;
  }
}

function sameObservation(a: WpmObservation, b: WpmObservation): boolean {
  return a.elapsed === b.elapsed && a.counters.correctInserts === b.counters.correctInserts &&
    a.counters.totalInserts === b.counters.totalInserts;
}

function refused(series: WpmSeries, refusal: WpmSeriesRefusal): WpmSeriesResult {
  return { ok: false, series, refusal };
}

function coarsen(points: readonly WpmSample[], spacingMs: number): readonly WpmSample[] {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return points;
  const retained = [first];
  let previous = first;
  for (const point of points.slice(1, -1)) {
    if (point.elapsed - previous.elapsed >= spacingMs) {
      retained.push(point);
      previous = point;
    }
  }
  if (last !== first) retained.push(last);
  return retained;
}
