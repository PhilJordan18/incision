import path from "node:path";
import { MAX_PASSAGE_LENGTH } from "@incision/domain";
import { beforeAll, describe, expect, it } from "vitest";
import { checkCorpus, type CorpusCheck, type CorpusRefusal, passageIdentity } from "./check";
import { readCorpusVersion } from "./files";
import type { CorpusFile } from "./format";
import { passageContentHash } from "./hash";

const FIXTURE_FOLDER = path.join(import.meta.dirname, "..", "..", "test", "fixtures", "corpus-contract");
const FIXTURE_VERSION = "contract-2026-10-21";
const VERNE = "fr-verne-vingt-mille-lieues-p1-ch14-pacifique";

type Files = { fr: CorpusFile; en: CorpusFile };
let fixture: Files;

beforeAll(async () => {
  fixture = (await readCorpusVersion(FIXTURE_VERSION, FIXTURE_FOLDER)) as Files;
});

/** A copy of the fixture with one change: the fixture itself is never edited. */
function variant(change: (files: Files) => void): Files {
  const files = structuredClone(fixture);
  change(files);
  return files;
}

const firstFr = (files: Pick<Files, "fr">) => files.fr.passages[0]!;
const firstEn = (files: Pick<Files, "en">) => files.en.passages[0]!;

function accepted(check: CorpusCheck) {
  if (!check.ok) {
    throw new Error(`refused: ${JSON.stringify(check.refusal)}`);
  }
  return check.corpus;
}

function refusalOf(check: CorpusCheck): CorpusRefusal {
  if (check.ok) {
    throw new Error("accepted, a refusal was expected");
  }
  return check.refusal;
}

describe("checkCorpus", () => {
  it("accepts the contract fixture: both languages serve D-19's defaults", () => {
    const corpus = accepted(checkCorpus(fixture));
    expect(corpus.version).toBe(FIXTURE_VERSION);
    expect(corpus.compatibleWithDefaults).toEqual({ fr: 1, en: 1 });
    expect(corpus.passages.map((passage) => passage.id)).toEqual(["en-stevenson-treasure-island-ch07-map", VERNE]);
    expect(corpus.checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fingerprints a passage by its text and source only (decision of October 21)", () => {
    const passage = firstFr(fixture);
    const hash = passageContentHash(passageIdentity(passage, 2));
    // Key order does not count.
    const reversed = Object.fromEntries(Object.entries(passageIdentity(passage, 2)).reverse()) as ReturnType<typeof passageIdentity>;
    expect(passageContentHash(reversed)).toBe(hash);
    // A re-measure, a new label, a new note, new check dates or another status: the same passage.
    const reassessed = {
      ...passage,
      complexity: "hard" as const,
      measures: { ...passage.measures, m1: 4.9 },
      editorial: { ...passage.editorial, reserves: ["à revoir"] },
      checks: { ...passage.checks, sourceVerifiedAt: "2026-11-02" },
      status: "spare" as const,
    };
    expect(passageContentHash(passageIdentity(reassessed, 2))).toBe(hash);
    // Another text, source, adaptation or normalisation version: another passage.
    expect(passageContentHash(passageIdentity({ ...passage, source: { ...passage.source, edition: "Hetzel, 1871" } }, 2))).not.toBe(hash);
    expect(passageContentHash(passageIdentity({ ...passage, adaptations: [] }, 2))).not.toBe(hash);
    expect(passageContentHash(passageIdentity(passage, 3))).not.toBe(hash);
  });

  it("gives a version another checksum when what it says of a passage changes", () => {
    const base = accepted(checkCorpus(fixture)).checksum;
    const remeasured = accepted(checkCorpus(variant((files) => (firstFr(files).measures.m4 = 18.5)))).checksum;
    const withSpare = accepted(checkCorpus(variant((files) => files.fr.passages.push({ ...firstFr(files), id: "fr-verne-copie-de-reserve", status: "spare" }))));
    expect(remeasured).not.toBe(base);
    expect(withSpare.checksum).not.toBe(base);
    // A spare is kept but never counted as serving the defaults.
    expect(withSpare.compatibleWithDefaults).toEqual({ fr: 1, en: 1 });
  });

  it("needs both languages, each file in its own language, with one header", () => {
    expect(refusalOf(checkCorpus({ fr: fixture.fr }))).toMatchObject({ code: "MISSING_LANGUAGE", language: "en" });
    expect(refusalOf(checkCorpus({ fr: fixture.en, en: fixture.en }))).toMatchObject({ code: "WRONG_LANGUAGE", language: "fr" });
    expect(refusalOf(checkCorpus(variant((files) => (files.en.corpusVersion = "contract-other"))))).toMatchObject({ code: "MIXED_HEADERS" });
    const otherZipf = variant((files) => {
      files.en.measuredWith = { ...files.en.measuredWith, commonZipf: 3.5 };
      firstEn(files).measures.measuredWith = files.en.measuredWith;
    });
    expect(refusalOf(checkCorpus(otherZipf))).toMatchObject({ code: "MIXED_HEADERS" });
  });

  it("refuses measures taken under another normalisation version than the corpus's (decision of October 21)", () => {
    const olderMeasures = variant((files) => {
      for (const file of [files.fr, files.en]) {
        file.measuredWith = { ...file.measuredWith, normalizationVersion: 1 };
        for (const passage of file.passages) passage.measures.measuredWith = file.measuredWith;
      }
    });
    expect(refusalOf(checkCorpus(olderMeasures))).toMatchObject({ code: "MEASURED_WITH_MISMATCH", language: "fr" });
  });

  it.each([
    ["an unknown field", (files: Files) => Object.assign(firstFr(files), { note: "free text" })],
    ["a missing licence", (files: Files) => Reflect.deleteProperty(firstFr(files).source, "licence")],
    ["a URL that is not https", (files: Files) => (firstFr(files).source.url = "http://fr.wikisource.org/w/index.php?oldid=11270647")],
    ["a blank revision", (files: Files) => (firstFr(files).source.revision = " ")],
    ["an unknown language", (files: Files) => Object.assign(firstFr(files), { language: "de" })],
    ["an unknown complexity", (files: Files) => Object.assign(firstFr(files), { complexity: "moyen" })],
    ["fewer than 10 words", (files: Files) => (firstFr(files).wordCount = 9)],
    ["a text longer than MAX_PASSAGE_LENGTH", (files: Files) => (firstFr(files).text = `a${" a".repeat(MAX_PASSAGE_LENGTH)}`)],
    ["no measurement setting", (files: Files) => Reflect.deleteProperty(firstFr(files).measures, "measuredWith")],
    ["a missing measure", (files: Files) => Reflect.deleteProperty(firstFr(files).measures, "m3")],
    ["an infinite measure (1e999 in JSON)", (files: Files) => (firstFr(files).measures.m4 = JSON.parse("1e999") as number)],
    ["M1 above 8 letters per word", (files: Files) => (firstFr(files).measures.m1 = 8.5)],
    ["M1 at zero", (files: Files) => (firstFr(files).measures.m1 = 0)],
    ["a percentage above 100", (files: Files) => (firstFr(files).measures.m2 = 100.5)],
    ["a negative count", (files: Files) => (firstFr(files).measures.m4 = -1)],
    ["a date that is not a date", (files: Files) => (firstFr(files).checks.sourceVerifiedAt = "12 octobre")],
    ["surrounding whitespace, never trimmed", (files: Files) => (firstFr(files).source.author = " Jules Verne")],
    ["a control character", (files: Files) => (firstFr(files).editorial.theme = "mer\u0007")],
    ["a bidirectional control character", (files: Files) => (firstFr(files).source.work = "Vingt mille lieues‮")],
    ["a lone surrogate", (files: Files) => (firstFr(files).source.place = "chapitre \ud800 XIV")],
    ["an invisible format character (zero-width space)", (files: Files) => (firstFr(files).source.author = "Jules\u200bVerne")],
    ["a URL with a control character", (files: Files) => (firstFr(files).source.url = "https://fr.wikisource.org/\u0007")],
    ["a URL with surrounding whitespace, never cleaned", (files: Files) => (firstFr(files).source.url = " https://fr.wikisource.org/w/index.php?oldid=11270647")],
    ["a URL that does not parse", (files: Files) => (firstFr(files).source.url = "https://")],
  ])("refuses %s, naming the file and the passage", (_label, change) => {
    expect(refusalOf(checkCorpus(variant(change)))).toMatchObject({ code: "INVALID_FORMAT", language: "fr", passageId: VERNE });
  });

  it("never echoes an id that is not well-formed: it could carry terminal escapes", () => {
    const refusal = refusalOf(checkCorpus(variant((files) => (firstFr(files).id = "fr-x\u001b]0;title\u0007"))));
    expect(refusal).toMatchObject({ code: "INVALID_FORMAT", language: "fr" });
    expect(refusal.passageId).toBeUndefined();
  });

  it("refuses an older normalisation version in a file header, naming the file", () => {
    expect(refusalOf(checkCorpus(variant((files) => Object.assign(files.fr, { normalizationVersion: 1 }))))).toEqual({
      code: "INVALID_FORMAT",
      language: "fr",
      detail: expect.stringContaining("normalizationVersion") as string,
    });
  });

  it("accepts line breaks and tabs in the exact source text, which normalisation joins", () => {
    const wrapped = variant((files) => (firstFr(files).sourceText = firstFr(files).sourceText.replace(" entre les deux", "\nentre les deux")));
    expect(checkCorpus(wrapped).ok).toBe(true);
  });

  it("refuses a passage in the other language's file, or with the other language's prefix", () => {
    const moved = variant((files) => files.fr.passages.push(firstEn(files)));
    expect(refusalOf(checkCorpus(moved))).toMatchObject({ code: "WRONG_LANGUAGE", passageId: "en-stevenson-treasure-island-ch07-map" });
    const prefixed = variant((files) => (firstFr(files).id = "en-verne-pacifique"));
    expect(refusalOf(checkCorpus(prefixed))).toMatchObject({ code: "WRONG_LANGUAGE", passageId: "en-verne-pacifique" });
  });

  it("refuses a typed text that is not the engine's normalisation of the exact source", () => {
    const edited = variant((files) => (firstFr(files).text = firstFr(files).text.replace("tranquille", "calme")));
    expect(refusalOf(checkCorpus(edited))).toMatchObject({ code: "NOT_NORMALISED", passageId: VERNE });
    const curly = variant((files) => (firstFr(files).text = firstFr(files).sourceText));
    expect(refusalOf(checkCorpus(curly))).toMatchObject({ code: "NOT_NORMALISED", passageId: VERNE });
    // A ligature left in the typed text: version 2 spells it out (P-4).
    const ligature = variant((files) => {
      firstFr(files).sourceText = `${firstFr(files).sourceText} Le cœur.`;
      firstFr(files).text = `${firstFr(files).text} Le cœur.`;
      firstFr(files).wordCount += 2;
    });
    expect(refusalOf(checkCorpus(ligature))).toMatchObject({ code: "NOT_NORMALISED", passageId: VERNE });
  });

  it("refuses a word count that D-10's count disagrees with", () => {
    expect(refusalOf(checkCorpus(variant((files) => (firstFr(files).wordCount = 64))))).toMatchObject({ code: "WORD_COUNT_MISMATCH", passageId: VERNE });
  });

  it("refuses measures taken with another setting than the file's", () => {
    const other = variant((files) => (firstFr(files).measures.measuredWith = { ...files.fr.measuredWith, listVersion: "wordfreq-3.1.1-small" }));
    expect(refusalOf(checkCorpus(other))).toMatchObject({ code: "MEASURED_WITH_MISMATCH", passageId: VERNE });
  });

  it("refuses the same id twice in a version", () => {
    expect(refusalOf(checkCorpus(variant((files) => files.fr.passages.push({ ...firstFr(files), status: "spare" }))))).toMatchObject({
      code: "DUPLICATE_ID",
      passageId: VERNE,
    });
  });

  it("refuses a language whose retained passages cannot serve D-19's defaults, never falling back", () => {
    // A hard passage only: the medium default has nothing to cut from.
    expect(refusalOf(checkCorpus(variant((files) => (firstEn(files).complexity = "hard"))))).toMatchObject({ code: "NO_DEFAULT_PASSAGE", language: "en" });
    // A spare only: spares are never drawn.
    expect(refusalOf(checkCorpus(variant((files) => (firstEn(files).status = "spare"))))).toMatchObject({ code: "NO_DEFAULT_PASSAGE", language: "en" });
  });
});
