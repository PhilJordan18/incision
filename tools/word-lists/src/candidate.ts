import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { parseWordListSource, WORD_DATA_SENTINEL } from "../../../packages/domain/src/words/data/format";
import { usesWordLetters } from "../../../packages/domain/src/text/typable";
import { readCbPack, type FrequencyBins } from "./cbpack";
import { readPinned } from "./pinned";

export type CandidateOptions = { rawDir: string; language: string; version: string; outDir: string };
type CandidateCounts = { input: number; accepted: number; duplicates: number; rejected: { frequency: number; syntax: number; alphabet: number } };
export const sha256 = (input: string | Uint8Array): string => createHash("sha256").update(input).digest("hex");
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;

export function candidateSettings(language: string, version: string): asserts language is "fr" | "en" {
  if (language !== "fr" && language !== "en") throw new RangeError("Language must be fr or en");
  if (!/^[a-z0-9][a-z0-9.-]{0,31}$/.test(version)) throw new RangeError("Invalid candidate version");
}

/** Syntax only: this neither identifies a language nor approves words for children. */
export function serializeCandidate(bins: FrequencyBins, language: string, version: string): { source: string; counts: CandidateCounts } {
  candidateSettings(language, version);
  const words = new Map<string, number>();
  const counts: CandidateCounts = { input: 0, accepted: 0, duplicates: 0, rejected: { frequency: 0, syntax: 0, alphabet: 0 } };
  bins.forEach((bin, index) => {
    for (const raw of bin) {
      counts.input++;
      const frequency = 900 - index;
      if (frequency < 0) { counts.rejected.frequency++; continue; }
      const word = raw.normalize("NFC").toLowerCase().normalize("NFC");
      if (!/^\p{Ll}+(?:'\p{Ll}+)*$/u.test(word) || word.normalize("NFKC") !== word) {
        counts.rejected.syntax++; continue;
      }
      if (!usesWordLetters(word, language)) { counts.rejected.alphabet++; continue; }
      // Bins arrive in descending frequency, so the first normalized form wins.
      if (words.has(word)) { counts.duplicates++; continue; }
      words.set(word, frequency);
    }
  });
  counts.accepted = words.size;
  if (words.size === 0) throw new RangeError("No syntactically admissible candidate words");
  const grouped = new Map<number, string[]>();
  for (const [word, frequency] of [...words].sort(([a], [b]) => compare(a, b))) {
    const group = grouped.get(frequency) ?? [];
    group.push(word);
    grouped.set(frequency, group);
  }
  const lines = [...grouped].sort(([a], [b]) => b - a).map(([frequency, group]) => `${frequency} ${group.join(" ")}`);
  const source = [`${WORD_DATA_SENTINEL} words ${language} ${version}`, ...lines, ""].join("\n");
  parseWordListSource(source);
  return { source, counts };
}

const NOTICE = `Candidate data, NOT approved for races or suitability for minors.
Source: wordfreq 3.1.1 by Robyn Speer and contributors.
https://github.com/rspeer/wordfreq/
Data: CC BY-SA 4.0 https://creativecommons.org/licenses/by-sa/4.0/
Full versioned credits: wordfreq-3.1.1.dist-info/METADATA in the pinned 3.1.1 wheel.
Sources include Google Books Ngrams, Leeds Internet Corpus, Wikipedia, ParaCrawl,
OPUS OpenSubtitles 2018 (OpenSubtitles), and SUBTLEX by Marc Brysbaert et al.
SUBTLEX is freely available data: http://crr.ugent.be/programs-data/subtitle-frequencies
Review and retain the upstream credits before any dataset publication.
Changes: NFC, lowercase, syntax/alphabet filtering, highest-frequency deduplication,
explicit code-unit sorting and conversion to the Incision word-list format.
No exclusion list, linguistic review, difficulty calibration or child-safety approval applied.
`;

/** Only the CLI calls this with production pins; injected pins are for synthetic tests. */
export function exportCandidate(options: CandidateOptions, testPins?: Readonly<Record<string, string>>): void {
  const { language, version } = options;
  candidateSettings(language, version);
  const inputPath = `wordfreq-3.1.1/wordfreq/data/large_${language}.msgpack.gz`;
  const raw = readPinned(options.rawDir, inputPath, testPins);
  const { source, counts } = serializeCandidate(readCbPack(raw), language, version);
  const filename = `${language}.words.txt`;
  const manifest = {
    status: "candidate-not-approved", exporterVersion: 1, policyVersion: 1, language, version,
    source: { name: "wordfreq", version: "3.1.1", path: inputPath, sha256: sha256(raw) },
    transformations: ["NFC", "lowercase", "NFC", "syntax-and-alphabet-filter", "highest-frequency-deduplication", "code-unit-sort"],
    counts, output: { file: filename, sha256: sha256(source) }, noticeSha256: sha256(NOTICE),
  };
  publish(options.outDir, { [filename]: source, "manifest.json": `${JSON.stringify(manifest, null, 2)}\n`, "NOTICE.txt": NOTICE });
}

/** A sibling lock serializes tool writers; a complete directory is renamed into place. */
function publish(outDir: string, files: Readonly<Record<string, string>>): void {
  const destination = resolve(outDir);
  const parent = dirname(destination);
  const lock = `${destination}.lock`;
  mkdirSync(lock);
  let temporary: string | undefined;
  try {
    if (lstatSync(destination, { throwIfNoEntry: false }) !== undefined) throw new Error("Output destination already exists");
    temporary = mkdtempSync(join(parent, `.${basename(destination)}-`));
    for (const [name, content] of Object.entries(files)) writeFileSync(join(temporary, name), content, { flag: "wx" });
    if (lstatSync(destination, { throwIfNoEntry: false }) !== undefined) throw new Error("Output destination already exists");
    renameSync(temporary, destination);
    temporary = undefined;
  } finally {
    if (temporary !== undefined) rmSync(temporary, { recursive: true });
    rmSync(lock, { recursive: true });
  }
}
