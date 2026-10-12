/**
 * Calibration report for F-02.4 (Q-1): counts and distributions of the pinned wordfreq lists, by
 * language, and how the proposed complexity thresholds split them. It decides nothing: I set the
 * thresholds after reading it, and this script publishes no derived list.
 *
 * Usage: npm run report -w @incision/word-lists -- <raw-dir>
 * where <raw-dir> holds `wordfreq-3.1.1/wordfreq/data/large_{fr,en}.msgpack.gz` and
 * `ldnoobw-5faf2ba/{fr,en}` (see the raw folder's PROVENANCE.md).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readCbPack, zipfOfBin } from "./cbpack";

type Language = "fr" | "en";
type Entry = { readonly word: string; readonly zipf: number; readonly length: number };

/** Starting thresholds proposed in the scope (Q-1): a calibration start, not a decision. */
const LEVELS = [
  { name: "easy", maxLength: 5, minZipf: 4.0 },
  { name: "medium", maxLength: 9, minZipf: 3.3 },
  { name: "hard", maxLength: 16, minZipf: 2.5 },
] as const;

const segmenter = new Intl.Segmenter("und", { granularity: "grapheme" });
const graphemes = (word: string): number => [...segmenter.segment(word.normalize("NFC"))].length;
const LETTERS = /^\p{L}+$/u;
const ASCII_LETTERS = /^[a-z]+$/;
const DIACRITIC = /[^\u0000-\u007f]/u;

function entries(rawDir: string, language: Language): readonly Entry[] {
  const bins = readCbPack(readFileSync(join(rawDir, "wordfreq-3.1.1", "wordfreq", "data", `large_${language}.msgpack.gz`)));
  return bins.flatMap((bin, index) => bin.map((word) => ({ word, zipf: zipfOfBin(index), length: graphemes(word) })));
}

function excluded(rawDir: string, language: Language): ReadonlySet<string> {
  const lines = readFileSync(join(rawDir, "ldnoobw-5faf2ba", language), "utf8").split("\n");
  return new Set(lines.map((line) => line.trim().toLowerCase()).filter((line) => line !== ""));
}

const pct = (part: number, whole: number): string => (whole === 0 ? "—" : `${((part * 100) / whole).toFixed(1)} %`);
const mean = (values: readonly number[]): string => (values.length === 0 ? "—" : (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));

function report(rawDir: string, language: Language): string {
  const all = entries(rawDir, language);
  const letters = all.filter((entry) => LETTERS.test(entry.word));
  const usable = language === "en" ? letters.filter((entry) => ASCII_LETTERS.test(entry.word)) : letters;
  const bad = excluded(rawDir, language);
  const lines: string[] = [];
  lines.push(`## ${language.toUpperCase()}`, "");
  lines.push(`- Entries in \`large_${language}\`: ${all.length}`);
  lines.push(`- Letters only: ${letters.length} (${pct(letters.length, all.length)})${language === "en" ? `; ASCII letters only: ${usable.length}` : ""}`);
  lines.push(`- Other entries (apostrophes, hyphens, digits, symbols): ${all.length - letters.length}`);
  if (language === "fr") {
    lines.push(`- Letters-only words with a diacritic: ${usable.filter((entry) => DIACRITIC.test(entry.word)).length} (${pct(usable.filter((entry) => DIACRITIC.test(entry.word)).length, usable.length)})`);
  }
  lines.push(`- LDNOOBW single-word entries found among the usable words: ${usable.filter((entry) => bad.has(entry.word)).length} (list size ${bad.size}, phrases included)`, "");

  lines.push("### Proposed levels (usable words only)", "", "| Level | Rule | Words | Mean Zipf | Mean length | Excluded by LDNOOBW | Not in the level below |", "|---|---|---|---|---|---|---|");
  let below: ReadonlySet<string> = new Set();
  for (const level of LEVELS) {
    const pool = usable.filter((entry) => entry.length <= level.maxLength && entry.zipf >= level.minZipf);
    const fresh = pool.filter((entry) => !below.has(entry.word)).length;
    lines.push(`| ${level.name} | length ≤ ${level.maxLength}, Zipf ≥ ${level.minZipf} | ${pool.length} | ${mean(pool.map((entry) => entry.zipf))} | ${mean(pool.map((entry) => entry.length))} | ${pool.filter((entry) => bad.has(entry.word)).length} | ${fresh} (${pct(fresh, pool.length)}) |`);
    below = new Set(pool.map((entry) => entry.word));
  }
  lines.push("");

  const zipfBands = [[6, Infinity], [5, 6], [4, 5], [3.3, 4], [2.5, 3.3], [-Infinity, 2.5]] as const;
  const lengthBands = [[1, 3], [4, 5], [6, 9], [10, 16], [17, Infinity]] as const;
  lines.push("### Usable words by Zipf band (rows) and length band (columns)", "");
  lines.push(`| Zipf | ${lengthBands.map(([low, high]) => (high === Infinity ? `≥ ${low}` : `${low}–${high}`)).join(" | ")} | Total |`);
  lines.push(`|---|${lengthBands.map(() => "---").join("|")}|---|`);
  for (const [low, high] of zipfBands) {
    const band = usable.filter((entry) => entry.zipf >= low && entry.zipf < high);
    const label = high === Infinity ? `≥ ${low}` : low === -Infinity ? `< ${high}` : `${low}–${high}`;
    lines.push(`| ${label} | ${lengthBands.map(([lo, hi]) => band.filter((entry) => entry.length >= lo && entry.length <= hi).length).join(" | ")} | ${band.length} |`);
  }
  lines.push("");
  return lines.join("\n");
}

const rawDir = process.argv[2];
if (rawDir === undefined) {
  console.error("Usage: npm run report -w @incision/word-lists -- <raw-dir>");
  process.exit(2);
}
console.log(["# Word lists: calibration report (F-02.4, Q-1)", "", "Generated from wordfreq 3.1.1 `large_*` lists and LDNOOBW 5faf2ba. Counts only: no threshold is decided here.", "", report(rawDir, "fr"), report(rawDir, "en")].join("\n"));
