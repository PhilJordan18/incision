import { describe, expect, it } from "vitest";
import { singleGrapheme, toGraphemes } from "./graphemes";

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
});
