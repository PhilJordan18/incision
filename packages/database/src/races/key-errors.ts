import { containsLineBreak, MAX_ENTRANT_INSERTS, toGraphemes } from "@incision/domain";
import { z } from "zod";

/** Aggregate expected graphemes only: never the typed text or the sequence of mistakes. */
export type StoredKeyErrors = {
  readonly version: 1;
  readonly keys: readonly { readonly grapheme: string; readonly count: number }[];
};

const counter = z.number().int().min(0).max(MAX_ENTRANT_INSERTS);
const shape = z.strictObject({
  version: z.literal(1),
  keys: z.array(z.strictObject({ grapheme: z.string().min(1), count: counter.min(1) })),
});

/** Validates exact counts, NFC and uniqueness, without exposing any payload in failures. */
export function checkedKeyErrors(input: unknown, result: { readonly correctInputs: number; readonly totalInputs: number }): StoredKeyErrors {
  const parsed = shape.safeParse(input);
  if (!parsed.success || !counter.safeParse(result.correctInputs).success || !counter.safeParse(result.totalInputs).success) {
    throw new Error("Invalid key error aggregate");
  }
  const seen = new Set<string>();
  let total = 0;
  for (const { grapheme, count } of parsed.data.keys) {
    // Expected text clusters are not subject to the keyboard's input-length limit.
    if (grapheme !== grapheme.normalize("NFC") || containsLineBreak(grapheme) || toGraphemes(grapheme).length !== 1 || seen.has(grapheme)) {
      throw new Error("Invalid key error aggregate");
    }
    seen.add(grapheme);
    total += count;
    if (!Number.isSafeInteger(total) || total > MAX_ENTRANT_INSERTS) throw new Error("Invalid key error aggregate");
  }
  if (total !== result.totalInputs - result.correctInputs) throw new Error("Key errors do not match the official counters");
  return parsed.data;
}

/** Freeze the engine map; sorting is by code units, independent of the reader's locale. */
export function keyErrorsFromEngine(missedKeys: Readonly<Record<string, number>>): StoredKeyErrors {
  return { version: 1, keys: Object.entries(missedKeys).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([grapheme, count]) => ({ grapheme, count })) };
}
