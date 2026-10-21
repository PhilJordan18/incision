import path from "node:path";
import { MAX_PASSAGE_LENGTH } from "@incision/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { checkCorpus, type CorpusCheck, passageContentHash } from "./check";
import { readCorpusVersion } from "./files";
import type { CorpusFile } from "./format";

const FIXTURE_FOLDER = path.join(import.meta.dirname, "..", "..", "test", "fixtures", "corpus-contract");
const FIXTURE_VERSION = "contract-2026-10-21";

let fixture: { fr: CorpusFile; en: CorpusFile };

beforeAll(async () => {
  fixture = (await readCorpusVersion(FIXTURE_VERSION, FIXTURE_FOLDER)) as { fr: CorpusFile; en: CorpusFile };
});

/** A copy of the fixture with one change: the fixture itself is never edited. */
function variant(change: (files: { fr: CorpusFile; en: CorpusFile }) => void): { fr: unknown; en: unknown } {
  const files = structuredClone(fixture);
  change(files);
  return files;
}

const firstFr = (files: { fr: CorpusFile }) => files.fr.passages[0]!;
const firstEn = (files: { en: CorpusFile }) => files.en.passages[0]!;

function refusalOf(check: CorpusCheck) {
  expect(check.ok).toBe(false);
  return check.ok ? undefined : check.refusal;
}

describe("checkCorpus", () => {
  it("accepts the contract fixture: both languages serve D-19's defaults", () => {
    const check = checkCorpus(fixture);
    expect(check.ok).toBe(true);
    if (!check.ok) return;
    expect(check.corpus.version).toBe(FIXTURE_VERSION);
    expect(check.corpus.compatibleWithDefaults).toEqual({ fr: 1, en: 1 });
    expect(check.corpus.passages.map((passage) => passage.id)).toEqual(["en-stevenson-treasure-island-ch07-map", "fr-verne-vingt-mille-lieues-p1-ch14-pacifique"]);
    expect(check.corpus.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes content, not key order; a passage's hash ignores its status, the version's does not", () => {
    const reordered = variant((files) => {
      const passage = firstFr(files);
      files.fr.passages[0] = Object.fromEntries(Object.entries(passage).reverse()) as typeof passage;
    });
    const a = checkCorpus(fixture);
    const b = checkCorpus(reordered);
    expect(a.ok && b.ok && a.corpus.checksum === b.corpus.checksum).toBe(true);
    const spare = { ...firstFr(fixture), status: "spare" as const };
    expect(passageContentHash(spare)).toBe(passageContentHash(firstFr(fixture)));
    const withSpare = variant((files) => files.fr.passages.push({ ...firstFr(files), id: "fr-verne-copie-de-reserve", status: "spare" }));
    const c = checkCorpus(withSpare);
    expect(c.ok && a.ok && c.corpus.checksum !== a.corpus.checksum).toBe(true);
    // A spare is kept but never counted as serving the defaults.
    expect(c.ok && c.corpus.compatibleWithDefaults).toEqual({ fr: 1, en: 1 });
  });

  it("needs both languages, each file in its own language, with one header", () => {
    expect(refusalOf(checkCorpus({ fr: fixture.fr }))).toMatchObject({ code: "MISSING_LANGUAGE", language: "en" });
    expect(refusalOf(checkCorpus({ fr: fixture.en, en: fixture.en }))).toMatchObject({ code: "WRONG_LANGUAGE", language: "fr" });
    expect(refusalOf(checkCorpus(variant((files) => (files.en.corpusVersion = "contract-other"))))).toMatchObject({ code: "MIXED_HEADERS" });
    expect(refusalOf(checkCorpus(variant((files) => (files.en.measuredWith = { ...files.en.measuredWith, commonZipf: 3.5 }))))).toMatchObject({ code: "MIXED_HEADERS" });
  });

  it.each([
    ["an unknown field", (files: { fr: CorpusFile }) => Object.assign(firstFr(files), { note: "free text" })],
    ["a missing licence", (files: { fr: CorpusFile }) => Reflect.deleteProperty(firstFr(files).source, "licence")],
    ["a URL that is not https", (files: { fr: CorpusFile }) => (firstFr(files).source.url = "http://fr.wikisource.org/w/index.php?oldid=11270647")],
    ["a missing revision", (files: { fr: CorpusFile }) => (firstFr(files).source.revision = " ")],
    ["an unknown complexity", (files: { fr: CorpusFile }) => Object.assign(firstFr(files), { complexity: "moyen" })],
    ["an id outside the pattern", (files: { fr: CorpusFile }) => (firstFr(files).id = "fr_Verne")],
    ["fewer than 10 words", (files: { fr: CorpusFile }) => (firstFr(files).wordCount = 9)],
    ["a text longer than MAX_PASSAGE_LENGTH", (files: { fr: CorpusFile }) => (firstFr(files).text = "a ".repeat(MAX_PASSAGE_LENGTH))],
    ["an older normalisation version", (files: { fr: CorpusFile }) => Object.assign(files.fr, { normalizationVersion: 1 })],
    ["no measurement setting", (files: { fr: CorpusFile }) => Reflect.deleteProperty(firstFr(files).measures, "measuredWith")],
    ["a missing measure", (files: { fr: CorpusFile }) => Reflect.deleteProperty(firstFr(files).measures, "m3")],
    ["an infinite measure (1e999 in JSON)", (files: { fr: CorpusFile }) => (firstFr(files).measures.m4 = JSON.parse("1e999") as number)],
    ["M1 above 8 letters per word", (files: { fr: CorpusFile }) => (firstFr(files).measures.m1 = 8.5)],
    ["M1 at zero", (files: { fr: CorpusFile }) => (firstFr(files).measures.m1 = 0)],
    ["a percentage above 100", (files: { fr: CorpusFile }) => (firstFr(files).measures.m2 = 100.5)],
    ["a negative count", (files: { fr: CorpusFile }) => (firstFr(files).measures.m4 = -1)],
    ["a date that is not a date", (files: { fr: CorpusFile }) => (firstFr(files).checks.sourceVerifiedAt = "12 octobre")],
  ])("refuses %s, naming the file", (_label, change) => {
    expect(refusalOf(checkCorpus(variant(change)))).toMatchObject({ code: "INVALID_FORMAT", language: "fr" });
  });

  it("refuses a passage in the other language's file, or with the other language's prefix", () => {
    const moved = variant((files) => files.fr.passages.push(firstEn(files)));
    expect(refusalOf(checkCorpus(moved))).toMatchObject({ code: "WRONG_LANGUAGE", passageId: "en-stevenson-treasure-island-ch07-map" });
    const prefixed = variant((files) => (firstFr(files).id = "en-verne-pacifique"));
    expect(refusalOf(checkCorpus(prefixed))).toMatchObject({ code: "WRONG_LANGUAGE", passageId: "en-verne-pacifique" });
  });

  it("refuses a typed text that is not the engine's normalisation of the exact source", () => {
    const edited = variant((files) => (firstFr(files).text = firstFr(files).text.replace("tranquille", "calme")));
    expect(refusalOf(checkCorpus(edited))).toMatchObject({ code: "NOT_NORMALISED", passageId: "fr-verne-vingt-mille-lieues-p1-ch14-pacifique" });
    const curly = variant((files) => (firstFr(files).text = firstFr(files).sourceText));
    expect(refusalOf(checkCorpus(curly))).toMatchObject({ code: "NOT_NORMALISED" });
    // A ligature left in the typed text: version 2 spells it out (P-4).
    const ligature = variant((files) => {
      firstFr(files).sourceText = `${firstFr(files).sourceText} Le cœur.`;
      firstFr(files).text = `${firstFr(files).text} Le cœur.`;
      firstFr(files).wordCount += 2;
    });
    expect(refusalOf(checkCorpus(ligature))).toMatchObject({ code: "NOT_NORMALISED" });
    const untypable = variant((files) => (firstFr(files).sourceText = `${firstFr(files).sourceText}​`));
    expect(refusalOf(checkCorpus(untypable))).toMatchObject({ code: "NOT_NORMALISED" });
  });

  it("refuses a word count that D-10's count disagrees with", () => {
    expect(refusalOf(checkCorpus(variant((files) => (firstFr(files).wordCount = 64))))).toMatchObject({ code: "WORD_COUNT_MISMATCH" });
  });

  it("refuses measures taken with another setting than the file's", () => {
    const other = variant((files) => (firstFr(files).measures.measuredWith = { ...files.fr.measuredWith, listVersion: "wordfreq-3.1.1-small" }));
    expect(refusalOf(checkCorpus(other))).toMatchObject({ code: "MEASURED_WITH_MISMATCH", passageId: "fr-verne-vingt-mille-lieues-p1-ch14-pacifique" });
  });

  it("refuses the same id twice in a version", () => {
    expect(refusalOf(checkCorpus(variant((files) => files.fr.passages.push({ ...firstFr(files), status: "spare" }))))).toMatchObject({
      code: "DUPLICATE_ID",
      passageId: "fr-verne-vingt-mille-lieues-p1-ch14-pacifique",
    });
  });

  it("refuses a language whose retained passages cannot serve D-19's defaults, never falling back", () => {
    // A hard passage only: the medium default has nothing to cut from.
    expect(refusalOf(checkCorpus(variant((files) => (firstEn(files).complexity = "hard"))))).toMatchObject({ code: "NO_DEFAULT_PASSAGE", language: "en" });
    // A spare only: spares are never drawn.
    expect(refusalOf(checkCorpus(variant((files) => (firstEn(files).status = "spare"))))).toMatchObject({ code: "NO_DEFAULT_PASSAGE", language: "en" });
  });
});
