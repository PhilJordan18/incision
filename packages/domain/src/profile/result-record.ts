/** D-12: only these two frozen settings define a record category. */
export type RecordCategory = { readonly bonuses: boolean; readonly errorMode: "mandatory" | "free" };
export type ResultRecord =
  | { readonly status: "unavailable" }
  | { readonly status: "first" | "improved" | "tied" | "below"; readonly category: RecordCategory };

/** Missing legacy settings and string booleans are unknown, never default settings. */
export function resultRecordCategory(config: unknown): RecordCategory | undefined {
  if (config === null || typeof config !== "object" || Array.isArray(config)
    || !("bonuses" in config) || !("errorMode" in config)
    || typeof config.bonuses !== "boolean"
    || (config.errorMode !== "mandatory" && config.errorMode !== "free")) return undefined;
  return { bonuses: config.bonuses, errorMode: config.errorMode };
}

/**
 * RES-04, approved 2026-10-25: a record at this race's end, not today's best.
 * The adapter supplies only this authenticated human finisher's earlier completed
 * races, grouped by category, at full stored precision. A null best is no reference,
 * distinct from zero. Unknown historical categories cannot prove a first/new record.
 * Eligibility is enforced before calling this comparison; no rounding here.
 */
export function compareResultRecord(input: {
  readonly category: RecordCategory;
  readonly netWpm: number;
  readonly previousBest: number | null;
  readonly historyComplete: boolean;
}): ResultRecord {
  const { category, netWpm, previousBest, historyComplete } = input;
  if (!historyComplete || resultRecordCategory(category) === undefined
    || !Number.isFinite(netWpm) || netWpm < 0
    || (previousBest !== null && (!Number.isFinite(previousBest) || previousBest < 0))) {
    return { status: "unavailable" };
  }
  const status = previousBest === null ? "first" : netWpm > previousBest ? "improved"
    : netWpm === previousBest ? "tied" : "below";
  return { status, category };
}
