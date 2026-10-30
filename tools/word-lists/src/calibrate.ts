/**
 * Calibration report for the complexity levels (#43, D-10, P-1), on the shipped word data and the
 * corpus files. It measures; it decides nothing. The criteria it reads are the engine's own
 * (`COMPLEXITY_CRITERIA`), and every draw uses a fixed seed, so the report is reproducible.
 *
 * Usage: npm run calibrate -w @incision/word-lists -- <corpus-version-dir>
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyMeasures,
  COMPLEXITIES,
  COMPLEXITY_CRITERIA,
  CRITERIA_VERSION,
  generateRaceText,
  measureText,
  type Complexity,
  type PassageThresholds,
  type RandomTextSettings,
  type TextLanguage,
} from "../../../packages/domain/src/index";
import { EXCLUSIONS, FORBIDDEN_PAIRS, WORD_LISTS } from "../../../packages/domain/src/words/data/index";
import { HARD_TO_TYPE_LETTERS } from "../../../packages/domain/src/text/typable";
import { buildWordPool } from "../../../packages/domain/src/words/pool";

const LANGUAGES: readonly TextLanguage[] = ["fr", "en"];
const LENGTHS = [10, 50, 200] as const;
const DRAWS = 40;
/** The vocabulary threshold of M3, as the corpus measures were taken (commonZipf 4). */
const COMMON_ZIPF = 4;

const THRESHOLD_KEYS = ["easyMaxMeanLetters", "easyMaxRareShare", "easyMaxSpecialPer100", "hardMinMeanLetters", "hardMinRareShare", "hardMinLongShare"] as const;
/** Which stored measure each threshold reads. */
const MEASURE_OF: Readonly<Record<(typeof THRESHOLD_KEYS)[number], "m1" | "m2" | "m3" | "m4">> = {
  easyMaxMeanLetters: "m1", easyMaxRareShare: "m3", easyMaxSpecialPer100: "m4", hardMinMeanLetters: "m1", hardMinRareShare: "m3", hardMinLongShare: "m2",
};

const mean = (values: readonly number[]): number => (values.length === 0 ? Number.NaN : values.reduce((sum, value) => sum + value, 0) / values.length);
const fixed = (value: number, digits = 2): string => (Number.isNaN(value) ? "—" : value.toFixed(digits));
function quantile(values: readonly number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return Number.NaN;
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position);
  return (sorted[low] ?? 0) + ((sorted[Math.ceil(position)] ?? 0) - (sorted[low] ?? 0)) * (position - low);
}
const spread = (values: readonly number[]): string => `${fixed(quantile(values, 0.1), 1)} / ${fixed(quantile(values, 0.5), 1)} / ${fixed(quantile(values, 0.9), 1)}`;

function settings(language: TextLanguage, complexity: Complexity, wordCount: number): RandomTextSettings {
  return { kind: "random", language, complexity, wordCount, options: { punctuation: true, numbers: false, capitals: true, accents: true }, include: [], exclude: [] };
}

function randomSection(language: TextLanguage): string[] {
  const words = { list: WORD_LISTS[language], exclusions: EXCLUSIONS[language], pairs: FORBIDDEN_PAIRS[language] };
  const lines = [`### Random mode, ${language.toUpperCase()} (list ${words.list.version}, ${words.list.entries.length} words)`, ""];
  lines.push("| Level | Rule | Pool | Pool without accents | Pool mean Zipf | Pool mean letters | Pool share > 9 letters |", "|---|---|---:|---:|---:|---:|---:|");
  for (const complexity of COMPLEXITIES) {
    const level = COMPLEXITY_CRITERIA[complexity];
    // The pool rule of random mode (random.ts), without the characters a host includes or excludes.
    const accept = (accents: boolean) => (entry: { word: string; zipf: number }) =>
      [...entry.word].length <= level.maxLetters && entry.zipf >= level.minZipf && ![...entry.word].some((character) => HARD_TO_TYPE_LETTERS.includes(character)) && (accents || /^[a-z']+$/u.test(entry.word));
    const pool = buildWordPool({ list: words.list, exclusions: words.exclusions, accept: accept(true) }).entries;
    const plain = buildWordPool({ list: words.list, exclusions: words.exclusions, accept: accept(false) }).entries;
    const letters = pool.map((entry) => [...entry.word].length);
    lines.push(
      `| ${complexity} | ≤ ${level.maxLetters} letters, Zipf ≥ ${level.minZipf} | ${pool.length} | ${plain.length} | ${fixed(mean(pool.map((entry) => entry.zipf)))} | ${fixed(mean(letters))} | ${fixed((100 * letters.filter((count) => count > 9).length) / Math.max(1, letters.length), 1)} % |`,
    );
  }
  lines.push("", `Generated texts: ${DRAWS} fixed seeds per cell, default options (punctuation, capitals, accents; no numbers). M1–M4 measured with \`measureText\`, commonZipf ${COMMON_ZIPF}; values are p10 / median / p90.`, "");
  lines.push("| Level | Words | Generated | M1 mean letters | M2 % > 9 letters | M3 % rare | M4 special /100 |", "|---|---:|---:|---|---|---|---|");
  const samples: string[] = [];
  for (const complexity of COMPLEXITIES) {
    for (const wordCount of LENGTHS) {
      const measures = [];
      const refusals = new Map<string, number>();
      for (let seed = 1; seed <= DRAWS; seed += 1) {
        const result = generateRaceText({ settings: settings(language, complexity, wordCount), words, state: [seed, 0x9e3779b9, seed * 7919, 0x85ebca6b] });
        if (!result.ok) {
          refusals.set(result.reason, (refusals.get(result.reason) ?? 0) + 1);
          continue;
        }
        measures.push(measureText(result.text, words.list, COMMON_ZIPF));
        if (seed === 1 && wordCount !== 200) samples.push(`- ${complexity}, ${wordCount} words: « ${result.text} »`);
      }
      const refused = [...refusals].map(([reason, count]) => `${reason} × ${count}`).join(", ");
      lines.push(
        `| ${complexity} | ${wordCount} | ${measures.length}/${DRAWS}${refused === "" ? "" : ` (${refused})`} | ${spread(measures.map((m) => m.meanLetters))} | ${spread(measures.map((m) => m.longWordShare))} | ${spread(measures.map((m) => m.rareWordShare))} | ${spread(measures.map((m) => m.specialPer100Words))} |`,
      );
    }
  }
  lines.push("", "Representative samples (seed 1):", "", ...samples, "");
  return lines;
}

type CorpusPassage = {
  readonly id: string;
  readonly complexity: Complexity;
  readonly status: string;
  readonly measures: { readonly m1: number; readonly m2: number; readonly m3: number; readonly m4: number };
};

/** The fields this report reads, checked: a corpus of another shape fails loudly instead of printing NaN. */
function corpusFile(value: unknown, language: TextLanguage): { readonly corpusVersion: string; readonly passages: readonly CorpusPassage[] } {
  const record = (input: unknown): Record<string, unknown> => {
    if (typeof input !== "object" || input === null || Array.isArray(input)) throw new TypeError(`corpus ${language}: object expected`);
    return input as Record<string, unknown>;
  };
  const file = record(value);
  if (typeof file.corpusVersion !== "string" || !Array.isArray(file.passages)) throw new TypeError(`corpus ${language}: corpusVersion and passages expected`);
  const passages = file.passages.map((input): CorpusPassage => {
    const passage = record(input);
    const measures = record(passage.measures);
    const values = [measures.m1, measures.m2, measures.m3, measures.m4];
    if (typeof passage.id !== "string" || typeof passage.status !== "string" || !COMPLEXITIES.some((level) => level === passage.complexity) || !values.every((m) => typeof m === "number" && Number.isFinite(m))) {
      throw new TypeError(`corpus ${language}: passage ${String(passage.id)} lacks its id, status, label or measures`);
    }
    const [m1, m2, m3, m4] = values as [number, number, number, number];
    return { id: passage.id, status: passage.status, complexity: passage.complexity as Complexity, measures: { m1, m2, m3, m4 } };
  });
  return { corpusVersion: file.corpusVersion, passages };
}

function passageSection(corpusDir: string, language: TextLanguage): string[] {
  const file = corpusFile(JSON.parse(readFileSync(join(corpusDir, `${language}.json`), "utf8")), language);
  const retained = file.passages.filter((passage) => passage.status === "retained");
  const lines = [`### Coherent passages, ${language.toUpperCase()} (corpus ${file.corpusVersion}, ${retained.length} retained of ${file.passages.length})`, ""];
  lines.push("Stored measures by editorial label, p10 / median / p90.", "", "| Label | Passages | M1 | M2 | M3 | M4 |", "|---|---:|---|---|---|---|");
  for (const complexity of COMPLEXITIES) {
    const group = retained.filter((passage) => passage.complexity === complexity);
    lines.push(`| ${complexity} | ${group.length} | ${spread(group.map((p) => p.measures.m1))} | ${spread(group.map((p) => p.measures.m2))} | ${spread(group.map((p) => p.measures.m3))} | ${spread(group.map((p) => p.measures.m4))} |`);
  }
  const fitted = fitThresholds(retained);
  lines.push("", `Thresholds fitted on these ${retained.length} passages (coordinate search over the observed values, maximising agreement with the editorial labels; in-sample, so an optimistic estimate):`, "", "\`\`\`json", JSON.stringify(fitted.thresholds), "\`\`\`");
  lines.push("", "Agreement of `classifyMeasures` with the fitted thresholds (rows: editorial label; columns: measured level).", "", "| Label | easy | medium | hard | Agreement |", "|---|---:|---:|---:|---:|");
  let agreeing = 0;
  for (const complexity of COMPLEXITIES) {
    const group = retained.filter((passage) => passage.complexity === complexity);
    const measured = group.map((p) => classify(p, fitted.thresholds));
    const count = (level: Complexity): number => measured.filter((value) => value === level).length;
    agreeing += count(complexity);
    lines.push(`| ${complexity} | ${count("easy")} | ${count("medium")} | ${count("hard")} | ${group.length === 0 ? "—" : `${Math.round((100 * count(complexity)) / group.length)} %`} |`);
  }
  lines.push("", `Leave-one-out agreement (each passage classified by thresholds fitted without it): ${leaveOneOut(retained)}/${retained.length}.`);
  lines.push("", `Overall agreement: ${agreeing}/${retained.length}.`, "");
  return lines;
}

function classify(passage: CorpusPassage, thresholds: PassageThresholds): Complexity {
  const { m1, m2, m3, m4 } = passage.measures;
  return classifyMeasures({ words: 0, measuredWords: 0, meanLetters: m1, longWordShare: m2, rareWordShare: m3, specialPer100Words: m4, unknownWords: [] }, thresholds);
}

const agreement = (passages: readonly CorpusPassage[], thresholds: PassageThresholds): number => passages.filter((p) => classify(p, thresholds) === p.complexity).length;

/** A threshold no measure reaches: an easy limit always met, a hard limit never met. */
const OFF = 1000;

/**
 * Deterministic coordinate search: each threshold in turn takes the observed value (or "off") that
 * most raises the agreement, ties to the first candidate, until nothing improves (bounded rounds).
 */
function fitThresholds(passages: readonly CorpusPassage[]): { readonly thresholds: PassageThresholds } {
  // Starts with every passage easy: the easy limits off (always met), the hard limits off (never met).
  let thresholds: PassageThresholds = { easyMaxMeanLetters: OFF, easyMaxRareShare: OFF, easyMaxSpecialPer100: OFF, hardMinMeanLetters: OFF, hardMinRareShare: OFF, hardMinLongShare: OFF };
  let best = agreement(passages, thresholds);
  for (let round = 0; round < 8; round += 1) {
    let improved = false;
    for (const key of THRESHOLD_KEYS) {
      const candidates = [...new Set(passages.map((p) => p.measures[MEASURE_OF[key]]))].sort((a, b) => a - b);
      for (const value of [...candidates, OFF]) {
        const trial = { ...thresholds, [key]: value };
        const score = agreement(passages, trial);
        if (score > best) {
          best = score;
          thresholds = trial;
          improved = true;
        }
      }
    }
    if (!improved) break;
  }
  return { thresholds };
}

function leaveOneOut(passages: readonly CorpusPassage[]): number {
  return passages.filter((passage, index) => classify(passage, fitThresholds(passages.filter((_, other) => other !== index)).thresholds) === passage.complexity).length;
}

const corpusDir = process.argv[2];
if (corpusDir === undefined) {
  console.error("calibrate <corpus-version-dir>");
  process.exitCode = 1;
} else {
  const out = [`## Calibration report — criteria ${CRITERIA_VERSION}`, ""];
  for (const language of LANGUAGES) out.push(...randomSection(language));
  for (const language of LANGUAGES) out.push(...passageSection(corpusDir, language));
  console.log(out.join("\n"));
}
