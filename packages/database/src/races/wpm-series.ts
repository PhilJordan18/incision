import { asDuration, decodeStoredWpmSeries, MAX_WPM_SERIES_POINTS, type StoredWpmSeries } from "@incision/domain";
import { z } from "zod";

/** Explicit compatibility path for legacy/test producers, never a default for the live runtime. */
export type ResultWpmSeries = StoredWpmSeries | { readonly unavailable: "not_collected" };

type ResultMeasures = {
  readonly elapsedMs: number;
  readonly correctInputs: number;
  readonly totalInputs: number;
  readonly netWpm: number;
  readonly rawWpm: number;
  readonly accuracy: number;
};

const sampleSchema = z.strictObject({
  elapsed: z.number().int().nonnegative(),
  counters: z.strictObject({ totalInserts: z.number().int().nonnegative(), correctInserts: z.number().int().nonnegative() }),
  measures: z.strictObject({ netWpm: z.number().finite().nonnegative(), rawWpm: z.number().finite().nonnegative(), accuracy: z.number().finite().min(0).max(100) }),
});
const storedSeriesSchema = z.strictObject({
  version: z.literal(1), spacingMs: z.number().int().positive(),
  points: z.array(sampleSchema).min(1).max(MAX_WPM_SERIES_POINTS),
});
const unavailableSchema = z.strictObject({ unavailable: z.literal("not_collected") });

/** Validate storage input once; errors contain no student identifiers, text or series payload. */
export function checkedResultWpmSeries(input: unknown, result: ResultMeasures): StoredWpmSeries | undefined {
  if (unavailableSchema.safeParse(input).success) return undefined;
  return checkedStoredWpmSeries(input, result);
}

/** A persisted row is never allowed to turn corruption into historical unavailability. */
export function checkedStoredWpmSeries(input: unknown, result: ResultMeasures): StoredWpmSeries {
  const shape = storedSeriesSchema.safeParse(input);
  if (!shape.success) throw new Error("Invalid stored WPM series shape");
  const parsed = decodeStoredWpmSeries(shape.data, {
    elapsed: asDuration(result.elapsedMs),
    counters: { correctInserts: result.correctInputs, totalInserts: result.totalInputs },
  });
  if (!parsed.ok) throw new Error(`Invalid stored WPM series: ${parsed.refusal}`);
  const end = parsed.value.points.at(-1);
  if (!end || end.measures.netWpm !== result.netWpm || end.measures.rawWpm !== result.rawWpm || end.measures.accuracy !== result.accuracy) {
    throw new Error("Stored WPM series does not match the official measures");
  }
  return parsed.value;
}
