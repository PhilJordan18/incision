/**
 * Selection of the playable random-mode lists (F-02.4, #42): a pure function from the syntactic
 * candidate (`serializeCandidate`) and the committed editorial register to the three server-only
 * data sources of `@incision/domain/words`. It applies decisions; it makes none. Every removal or
 * exclusion comes from a reviewed register line with its reason, and the frequency floor is a
 * versioned policy constant, so identical inputs give identical bytes.
 */
import { foldForExclusion } from "../../../packages/domain/src/words/pool";
import { parseExclusionSource, parsePairSource, parseWordListSource, WORD_DATA_SENTINEL } from "../../../packages/domain/src/words/data/format";
import { usesWordLetters } from "../../../packages/domain/src/text/typable";

export type Language = "fr" | "en";

/** Version 1: Zipf ≥ 3.50, the floor of the hardest level after calibration (#43). */
export const SELECTION_POLICY = { version: 1, minCentiZipf: 350 } as const;

export const REVIEW_ACTIONS = ["remove", "exclude", "homonym-keep", "homonym-exclude", "identity", "pejorative"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const REMOVE_CATEGORIES = ["fragment", "abbreviation", "proper-noun", "foreign", "nonstandard"] as const;
export const EXCLUDE_CATEGORIES = ["swear", "insult", "slur", "sexual", "degrading"] as const;

export type ReviewEntry = { readonly word: string; readonly action: ReviewAction; readonly category: string; readonly reason: string };
export type ExtraPair = { readonly first: string; readonly second: string; readonly reason: string };

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const LINE = /^[^\t\r]+$/;

function categoryAllowed(action: ReviewAction, category: string): boolean {
  if (action === "remove") return (REMOVE_CATEGORIES as readonly string[]).includes(category);
  if (action === "exclude" || action === "homonym-exclude") return (EXCLUDE_CATEGORIES as readonly string[]).includes(category);
  if (action === "homonym-keep") return category === "homonym-keep";
  return category === action;
}

/** `word<TAB>action<TAB>category<TAB>reason` per line, sorted by word, each word once. */
export function parseReview(source: string, language: Language): readonly ReviewEntry[] {
  if (source.includes("\r")) throw new RangeError("review: LF line endings only");
  const entries: ReviewEntry[] = [];
  for (const [index, line] of source.split("\n").entries()) {
    if (line === "") continue;
    const fields = line.split("\t");
    const [word = "", action = "", category = "", reason = ""] = fields;
    const where = `review ${language} line ${index + 1}`;
    if (fields.length !== 4 || !fields.every((field) => LINE.test(field) && field.trim() === field)) {
      throw new RangeError(`${where}: four non-empty, trimmed fields expected`);
    }
    if (!(REVIEW_ACTIONS as readonly string[]).includes(action) || !categoryAllowed(action as ReviewAction, category)) {
      throw new RangeError(`${where}: unknown action or category "${action}/${category}"`);
    }
    if (!/^\p{Ll}+(?:'\p{Ll}+)*$/u.test(word) || !usesWordLetters(word, language)) throw new RangeError(`${where}: invalid word`);
    const previous = entries.at(-1);
    if (previous !== undefined && compare(previous.word, word) >= 0) throw new RangeError(`${where}: words must be unique and sorted`);
    entries.push({ word, action: action as ReviewAction, category, reason });
  }
  return entries;
}

/** `word<TAB>word<TAB>reason` per line: pairs added to the identity × pejorative product. */
export function parseExtraPairs(source: string, language: Language): readonly ExtraPair[] {
  if (source.includes("\r")) throw new RangeError("pairs: LF line endings only");
  return source.split("\n").filter((line) => line !== "").map((line, index) => {
    const fields = line.split("\t");
    if (fields.length !== 3 || !fields.every((field) => LINE.test(field) && field.trim() === field)) {
      throw new RangeError(`pairs ${language} line ${index + 1}: three non-empty, trimmed fields expected`);
    }
    return { first: fields[0] ?? "", second: fields[1] ?? "", reason: fields[2] ?? "" };
  });
}

export type SelectionCounts = {
  readonly candidate: number;
  readonly aboveFloor: number;
  readonly removed: Readonly<Record<string, number>>;
  readonly excluded: Readonly<Record<string, number>>;
  readonly playable: number;
  readonly exclusions: number;
  readonly pairs: number;
};

export type Selection = { readonly words: string; readonly exclusions: string; readonly pairs: string; readonly counts: SelectionCounts };

const tally = (entries: readonly ReviewEntry[]): Readonly<Record<string, number>> =>
  Object.fromEntries([...new Set(entries.map((entry) => entry.category))].sort(compare).map((category) => [category, entries.filter((entry) => entry.category === category).length]));

/**
 * The playable list (candidate words at or above the floor, minus every removed or excluded word),
 * the exclusions (applied again by the engine before any draw) and the forbidden pairs (each
 * identity term with each pejorative word, plus the extra pairs). Throws on any register line that
 * names a word the candidate does not hold, so a typo never passes for a decision.
 */
export function selectPlayable(input: {
  readonly candidate: string;
  readonly review: readonly ReviewEntry[];
  readonly extraPairs: readonly ExtraPair[];
  readonly version: string;
}): Selection {
  const candidate = parseWordListSource(input.candidate);
  const { language } = candidate;
  if (language !== "fr" && language !== "en") throw new RangeError("Unsupported language");
  const known = new Set(candidate.entries.map((entry) => entry.word));
  const unknown = input.review.filter((entry) => !known.has(entry.word));
  if (unknown.length > 0) throw new RangeError(`review ${language}: ${unknown.length} word(s) absent from the candidate, first "${unknown[0]?.word}"`);

  const dropped = input.review.filter((entry) => entry.action === "remove" || entry.action === "exclude" || entry.action === "homonym-exclude");
  const excluded = dropped.filter((entry) => entry.action !== "remove");
  const droppedWords = new Set(dropped.map((entry) => entry.word));
  // The engine compares exclusions on folded forms: a listed word folding like an excluded one goes too.
  const excludedFolds = new Set(excluded.map((entry) => foldForExclusion(entry.word)));
  const aboveFloor = candidate.entries.filter((entry) => Math.round(entry.zipf * 100) >= SELECTION_POLICY.minCentiZipf);
  const playable = aboveFloor.filter((entry) => !droppedWords.has(entry.word) && !excludedFolds.has(foldForExclusion(entry.word)));
  const playableWords = new Set(playable.map((entry) => entry.word));

  const marked = (action: ReviewAction): readonly string[] => input.review.filter((entry) => entry.action === action).map((entry) => entry.word);
  for (const word of [...marked("identity"), ...marked("pejorative"), ...marked("homonym-keep")]) {
    if (!playableWords.has(word)) throw new RangeError(`review ${language}: kept word "${word}" is not in the playable list`);
  }
  const pairs = new Map<string, readonly [string, string]>();
  const addPair = (first: string, second: string): void => {
    if (!playableWords.has(first) || !playableWords.has(second)) throw new RangeError(`pairs ${language}: "${first} ${second}" names a word outside the playable list`);
    const sorted = [first, second].sort(compare) as [string, string];
    if (foldForExclusion(sorted[0]) !== foldForExclusion(sorted[1])) pairs.set(sorted.join(" "), sorted);
  };
  for (const identity of marked("identity")) for (const pejorative of marked("pejorative")) addPair(identity, pejorative);
  for (const pair of input.extraPairs) addPair(pair.first, pair.second);

  const bins = new Map<number, string[]>();
  for (const entry of playable) {
    const bin = Math.round(entry.zipf * 100);
    bins.set(bin, [...(bins.get(bin) ?? []), entry.word]);
  }
  const words = [
    `${WORD_DATA_SENTINEL} words ${language} ${input.version}`,
    ...[...bins].sort(([a], [b]) => b - a).map(([bin, group]) => `${bin} ${[...group].sort(compare).join(" ")}`),
  ].join("\n");
  const exclusions = [`${WORD_DATA_SENTINEL} exclusions ${language} ${input.version}`, ...excluded.map((entry) => entry.word)].join("\n");
  const pairSource = [`${WORD_DATA_SENTINEL} pairs ${language} ${input.version}`, ...[...pairs.keys()].sort(compare)].join("\n");
  // Parsed back with the engine's own parsers: the selection never emits data the server refuses.
  parseWordListSource(words);
  parseExclusionSource(exclusions);
  parsePairSource(pairSource);
  return {
    words,
    exclusions,
    pairs: pairSource,
    counts: {
      candidate: candidate.entries.length,
      aboveFloor: aboveFloor.length,
      removed: tally(dropped.filter((entry) => entry.action === "remove")),
      excluded: tally(excluded),
      playable: playable.length,
      exclusions: excluded.length,
      pairs: pairs.size,
    },
  };
}
