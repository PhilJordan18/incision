import { z } from "zod";
import type { RaceResultRow } from "./lifecycle";
import { checkedResultWpmSeries } from "./wpm-series";

const exact = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const shape = z.object({
  entrantId: z.string().uuid(), outcome: z.enum(["finished", "timed_out", "abandoned"]),
  rank: z.number().int().min(1).max(32767), elapsedMs: exact,
  position: z.number().int().nonnegative().max(2147483647),
  length: z.number().int().min(1).max(2147483647),
  correctInputs: exact, totalInputs: exact,
  netWpm: z.number().finite().nonnegative(), rawWpm: z.number().finite().nonnegative(),
  accuracy: z.number().finite().min(0).max(100),
  abandonmentReason: z.enum(["voluntary", "disconnection", "inactivity"]).optional(),
});

/** No INSERT means SQL result constraints cannot validate ephemeral results for us. */
export function checkTemporaryResults(entrantIds: readonly string[], results: readonly RaceResultRow[]): void {
  const expected = new Set(entrantIds), ids = new Set<string>(), ranks = new Set<number>();
  if (expected.size !== results.length) throw new Error("Incomplete temporary results");
  for (const row of results) {
    const parsed = shape.safeParse(row);
    if (!parsed.success) throw new Error("Invalid temporary result shape");
    const r = parsed.data;
    if (!expected.has(r.entrantId) || ids.has(r.entrantId) || ranks.has(r.rank) ||
      r.position > r.length || r.correctInputs > r.totalInputs || r.rawWpm < r.netWpm ||
      (r.outcome === "finished") !== (r.position === r.length) ||
      (r.outcome === "abandoned") !== (r.abandonmentReason !== undefined)) {
      throw new Error("Invalid temporary result invariants");
    }
    checkedResultWpmSeries(row.wpmSeries, row);
    ids.add(r.entrantId); ranks.add(r.rank);
  }
}
