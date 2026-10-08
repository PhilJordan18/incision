import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_GRAPHEME_LENGTH, singleGrapheme, toGraphemes } from "./graphemes";

describe("toGraphemes", () => {
  it("counts a decomposed accent once, as its precomposed NFC form", () => {
    expect(toGraphemes("été")).toEqual(["é", "t", "é"]);
  });

  it("keeps an emoji sequence joined by zero-width joiners as one grapheme", () => {
    expect(toGraphemes("a👩‍💻b")).toEqual(["a", "👩‍💻", "b"]);
  });

  it("keeps a flag and CRLF as one grapheme each", () => {
    expect(toGraphemes("🇨🇦\r\n")).toEqual(["🇨🇦", "\r\n"]);
  });

  it("counts spaces and punctuation like any other grapheme", () => {
    expect(toGraphemes("Le vent, d'un coup.")).toHaveLength(19);
  });

  it("gives an empty list for an empty text", () => {
    expect(toGraphemes("")).toEqual([]);
  });
});

describe("singleGrapheme", () => {
  it("returns the NFC form of exactly one grapheme", () => {
    expect(singleGrapheme("é")).toBe("é");
    expect(singleGrapheme(" ")).toBe(" ");
  });

  it("refuses nothing or more than one grapheme", () => {
    expect(singleGrapheme("")).toBeUndefined();
    expect(singleGrapheme("ab")).toBeUndefined();
  });

  it("accepts a long emoji sequence but refuses a grapheme over the length bound", () => {
    expect(singleGrapheme("👩‍💻")).toBe("👩‍💻");
    // "x" has no precomposed accented form, so NFC keeps all 16 code units.
    expect(singleGrapheme(`x${"\u0301".repeat(MAX_GRAPHEME_LENGTH - 1)}`)).toHaveLength(MAX_GRAPHEME_LENGTH);
    expect(singleGrapheme(`a${"\u0301".repeat(MAX_GRAPHEME_LENGTH)}`)).toBeUndefined();
    expect(singleGrapheme(`a${"\u0301".repeat(50_000)}`)).toBeUndefined();
  });
});

describe("without Intl.Segmenter (older browsers)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("falls back to the code points of the NFC form", () => {
    vi.stubGlobal("Intl", { ...Intl, Segmenter: undefined });
    // A segmenter would give one grapheme; the fallback gives woman, zero-width joiner, laptop.
    expect(toGraphemes("e\u0301👩‍💻")).toEqual(["é", "👩", "\u200d", "💻"]);
  });
});
