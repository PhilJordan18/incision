import { describe, expect, it } from "vitest";
import { parseExclusionSource, parsePairSource, parseWordListSource, WORD_DATA_SENTINEL } from "../../../packages/domain/src/words/data/format";
import { buildWordPool } from "../../../packages/domain/src/words/pool";
import { parseExtraPairs, parseReview, selectPlayable } from "../src/select";

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
    expect(list.entries.map((entry) => entry.word)).toEqual(["de", "la", "mer", "juif", "noir", "sale", "bateau", "côte", "navire", "voile"]);
    expect(parseExclusionSource(result.exclusions).words).toEqual(["merde"]);
    expect(result.counts).toEqual({
      candidate: 14, aboveFloor: 13, removed: { fragment: 1, "proper-noun": 1 }, excluded: { swear: 1 }, playable: 10, exclusions: 1, pairs: 3,
    });
  });

  it("pairs every identity term with every pejorative word, plus the extra pairs, sorted", () => {
    expect(parsePairSource(select().pairs).pairs).toEqual([["juif", "sale"], ["mer", "navire"], ["noir", "sale"]]);
  });

  it("drops a listed word that folds like an excluded one, so the engine's exclusion never empties a slot later", () => {
    const folded = `${WORD_DATA_SENTINEL} words fr candidate-1\n500 cote côte`;
    const result = selectPlayable({ candidate: folded, review: parseReview("côte\texclude\tinsult\ttest", "fr"), extraPairs: [], version: "wf311-r1" });
    expect(parseWordListSource(result.words).entries).toEqual([]);
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
    expect(() => select({ extraPairs: parseExtraPairs("mer\tmerde\texcluded word\n", "fr") })).toThrow("outside the playable list");
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

  it("refuses a malformed extra pair", () => {
    expect(() => parseExtraPairs("mer navire reason\n", "fr")).toThrow(RangeError);
  });
});
