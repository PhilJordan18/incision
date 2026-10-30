import { describe, expect, it } from "vitest";
import { parseExclusionSource, parsePairSource, parseWordListSource, WORD_DATA_SENTINEL } from "../../../packages/domain/src/words/data/format";
import { buildWordPool } from "../../../packages/domain/src/words/pool";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { COMPLEXITIES, COMPLEXITY_CRITERIA } from "../../../packages/domain/src/index";
import { parseExtraPairs, parseReview, selectPlayable, SELECTION_POLICY } from "../src/select";

const candidate = [
  `${WORD_DATA_SENTINEL} words fr candidate-1`,
  "700 de la",
  "500 mer merde paris qu",
  "420 sale juif noir",
  "400 bateau côte",
  "351 navire",
  "350 voile",
  "349 rare",
].join("\n");

const review = [
  "bateau\thomonym-keep\thomonym-keep\tordinary sense dominates",
  "côte\thomonym-exclude\tsexual\ttest homonym excluded",
  "juif\tidentity\tidentity\tidentity term, kept",
  "merde\texclude\tswear\tswear word",
  "noir\tidentity\tidentity\tcolour and identity term, kept",
  "paris\tremove\tproper-noun\tcity name",
  "qu\tremove\tfragment\tclitic fragment",
  "sale\tpejorative\tpejorative\thostile next to an identity term",
].join("\n");

const select = (overrides: Partial<Parameters<typeof selectPlayable>[0]> = {}) =>
  selectPlayable({ candidate, review: parseReview(review, "fr"), extraPairs: parseExtraPairs("mer\tnavire\ttest pair\n", "fr"), version: "wf311-r1", ...overrides });

describe("playable selection", () => {
  it("keeps the words at or above the floor, minus removals and exclusions, in the engine's format", () => {
    const result = select();
    const list = parseWordListSource(result.words);
    expect(list.version).toBe("wf311-r1");
    expect(list.entries.map((entry) => entry.word)).toEqual(["de", "la", "mer", "juif", "noir", "sale", "bateau", "navire", "voile"]);
    expect(parseExclusionSource(result.exclusions).words).toEqual(["côte", "merde"]);
    expect(result.counts).toEqual({
      candidate: 14, aboveFloor: 13, removed: { fragment: 1, "proper-noun": 1 }, excluded: { sexual: 1, swear: 1 }, foldDropped: 0, playable: 9, exclusions: 2, pairs: 3,
    });
  });

  it("pairs every identity term with every pejorative word, plus the extra pairs, sorted", () => {
    expect(parsePairSource(select().pairs).pairs).toEqual([["juif", "sale"], ["mer", "navire"], ["noir", "sale"]]);
  });

  it("drops a listed word that folds like an excluded one, so the engine's exclusion never empties a slot later", () => {
    const folded = `${WORD_DATA_SENTINEL} words fr candidate-1\n500 cote côte`;
    const result = selectPlayable({ candidate: folded, review: parseReview("côte\texclude\tinsult\ttest", "fr"), extraPairs: [], version: "wf311-r1" });
    expect(parseWordListSource(result.words).entries).toEqual([]);
    expect(result.counts.foldDropped).toBe(1);
  });

  it("produces data the engine's pool accepts whole: no listed word is excluded", () => {
    const result = select();
    const list = parseWordListSource(result.words);
    expect(buildWordPool({ list, exclusions: parseExclusionSource(result.exclusions) }).entries).toEqual(list.entries);
  });

  it("is deterministic", () => {
    expect(select()).toEqual(select());
  });

  it("refuses a decision about a word the candidate does not hold", () => {
    expect(() => select({ review: parseReview("mrede\texclude\tswear\ttypo", "fr") })).toThrow("absent from the candidate");
  });

  it("refuses a kept identity, pejorative or homonym word that is not playable", () => {
    expect(() => select({ review: parseReview("rare\tidentity\tidentity\tbelow the floor", "fr") })).toThrow("not in the playable list");
  });

  it("refuses an extra pair naming a word outside the playable list", () => {
    expect(() => select({ extraPairs: parseExtraPairs("merde\tmer\texcluded word\n", "fr") })).toThrow(RangeError);
    expect(() => select({ extraPairs: parseExtraPairs("mer\tparis\tremoved word\n", "fr") })).toThrow("outside the playable list");
  });

  it("refuses an extra pair of two words that fold alike, which the rule could never apply", () => {
    const candidate = `${WORD_DATA_SENTINEL} words fr candidate-1\n500 cote côte`;
    expect(() => selectPlayable({ candidate, review: [], extraPairs: parseExtraPairs("cote\tcôte\ttest\n", "fr"), version: "wf311-r1" })).toThrow("same word once folded");
  });
});

describe("the committed selection wf311-r1", () => {
  const manifest = JSON.parse(readFileSync(new URL("../review/wf311-r1/manifest.json", import.meta.url), "utf8")) as { outputs: Record<string, string> };

  it("matches the manifest byte for byte: the data files are never edited by hand", () => {
    expect(Object.keys(manifest.outputs)).toHaveLength(4);
    for (const [path, digest] of Object.entries(manifest.outputs)) {
      const content = readFileSync(new URL(`../../../${path}`, import.meta.url));
      expect(createHash("sha256").update(content).digest("hex"), path).toBe(digest);
    }
  });

  it("keeps the list floor at or below every level's Zipf floor, so no level is silently cut", () => {
    for (const complexity of COMPLEXITIES) {
      expect(SELECTION_POLICY.minCentiZipf).toBeLessThanOrEqual(Math.round(COMPLEXITY_CRITERIA[complexity].minZipf * 100));
    }
  });
});

describe("register parsing", () => {
  it.each([
    ["unknown action", "mer\tdelete\tswear\tx"],
    ["category of another action", "mer\tremove\tswear\tx"],
    ["missing reason", "mer\texclude\tswear"],
    ["padded field", "mer\texclude\tswear\t x"],
    ["uppercase word", "Mer\texclude\tswear\tx"],
    ["letter outside the alphabet", "idiоt\texclude\tinsult\tx"],
    ["unsorted lines", "mer\texclude\tswear\tx\nlac\texclude\tswear\tx"],
    ["duplicate word", "mer\texclude\tswear\tx\nmer\tremove\tfragment\tx"],
    ["CR line ending", "mer\texclude\tswear\tx\r\n"],
  ])("refuses %s", (_, source) => {
    expect(() => parseReview(source, "fr")).toThrow(RangeError);
  });

  it.each([
    ["one field", "mer navire reason\n"],
    ["an unsorted pair", "navire\tmer\tx\n"],
    ["a duplicate pair", "mer\tnavire\tx\nmer\tnavire\tx\n"],
    ["unsorted pairs", "mer\tnavire\tx\nlac\tmer\tx\n"],
  ])("refuses an extra pair file with %s", (_, source) => {
    expect(() => parseExtraPairs(source, "fr")).toThrow(RangeError);
  });

  it("numbers lines as the file does, blank lines included", () => {
    expect(() => parseExtraPairs("\n\nmer navire\n", "fr")).toThrow("line 3");
  });
});
