import { describe, expect, it } from "vitest";
import { parseExclusionSource, parsePairSource, parseWordListSource, WORD_DATA_SENTINEL } from "./format";

const words = (body: string, head = `${WORD_DATA_SENTINEL} words fr v1`): string => `${head}\n${body}`;

describe("parseWordListSource", () => {
  it("reads the bins in order, Zipf to two decimals", () => {
    expect(parseWordListSource(words("523 de la\n401 aujourd'hui cœur\n250 éléphant"))).toEqual({
      language: "fr",
      version: "v1",
      entries: [
        { word: "de", zipf: 5.23 },
        { word: "la", zipf: 5.23 },
        { word: "aujourd'hui", zipf: 4.01 },
        { word: "cœur", zipf: 4.01 },
        { word: "éléphant", zipf: 2.5 },
      ],
    });
  });

  it("accepts an empty list and a trailing newline", () => {
    expect(parseWordListSource(`${WORD_DATA_SENTINEL} words en fixture-1\n`).entries).toEqual([]);
  });

  it.each([
    ["no sentinel", "words fr v1\n500 de"],
    ["another sentinel version", "incision-word-lists-data-v2 words fr v1\n500 de"],
    ["the sentinel later in the source", `500 de\n${WORD_DATA_SENTINEL} words fr v1`],
    ["another kind", `${WORD_DATA_SENTINEL} exclusions fr v1\n500 de`],
    ["an unknown language", `${WORD_DATA_SENTINEL} words es v1\n500 de`],
    ["a missing version", `${WORD_DATA_SENTINEL} words fr\n500 de`],
    ["an uppercase version", `${WORD_DATA_SENTINEL} words fr V1\n500 de`],
    ["a version with an underscore", `${WORD_DATA_SENTINEL} words fr v_1\n500 de`],
    ["a version split in two", `${WORD_DATA_SENTINEL} words fr v 1\n500 de`],
    ["an extra header field", `${WORD_DATA_SENTINEL} words fr v1 extra\n500 de`],
  ])("refuses %s", (_label, source) => {
    expect(() => parseWordListSource(source)).toThrow(RangeError);
  });

  it.each([
    ["ascending bins", "400 de\n500 la"],
    ["a repeated bin", "500 de\n500 la"],
    ["a bin above Zipf 9", "901 de"],
    ["a decimal bin", "5.0 de"],
    ["a negative bin", "-1 de"],
    ["a bin without words", "500"],
    ["a duplicate word", "500 de\n400 de"],
    ["an uppercase word", "500 Maison"],
    ["a decomposed accent", "500 été"],
    ["a digit", "500 a4"],
    ["a typographic apostrophe", "500 aujourd’hui"],
    ["a leading apostrophe", "500 'tis"],
    ["a doubled space", "500 de  la"],
    ["a hyphen", "500 peut-être"],
  ])("refuses %s", (_label, body) => {
    expect(() => parseWordListSource(words(body))).toThrow(RangeError);
  });
});

describe("parseExclusionSource and parsePairSource", () => {
  it("read one word or one pair per line", () => {
    expect(parseExclusionSource(`${WORD_DATA_SENTINEL} exclusions en v1\nfoo\nbar`)).toEqual({ language: "en", version: "v1", words: ["foo", "bar"] });
    expect(parsePairSource(`${WORD_DATA_SENTINEL} pairs fr v1\nsale juif\nlune soleil`)).toEqual({
      language: "fr",
      version: "v1",
      pairs: [
        ["sale", "juif"],
        ["lune", "soleil"],
      ],
    });
  });

  it.each([
    ["an exclusion with a space", () => parseExclusionSource(`${WORD_DATA_SENTINEL} exclusions fr v1\nmot interdit`)],
    ["an uppercase exclusion", () => parseExclusionSource(`${WORD_DATA_SENTINEL} exclusions fr v1\nInterdit`)],
    ["a words source read as exclusions", () => parseExclusionSource(`${WORD_DATA_SENTINEL} words fr v1\nmot`)],
    ["a pair of three words", () => parsePairSource(`${WORD_DATA_SENTINEL} pairs fr v1\nun deux trois`)],
    ["a single word as a pair", () => parsePairSource(`${WORD_DATA_SENTINEL} pairs fr v1\nseul`)],
    ["a word paired with itself", () => parsePairSource(`${WORD_DATA_SENTINEL} pairs fr v1\nmot mot`)],
  ])("refuse %s", (_label, parse) => {
    expect(parse).toThrow(RangeError);
  });
});
