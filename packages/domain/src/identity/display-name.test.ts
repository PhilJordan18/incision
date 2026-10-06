import { describe, expect, it } from "vitest";
import { canonicalDisplayName, DISPLAY_NAME_MAX_LENGTH, parseDisplayName } from "./display-name";

describe("parseDisplayName", () => {
  it("normalises NFKC, trims and collapses inner whitespace", () => {
    expect(parseDisplayName("  Ｅｍｉｌｅ   Côté ")).toEqual({ ok: true, value: "Emile Côté" });
  });

  it("counts code points like PostgreSQL char_length, so 40 astral characters fit", () => {
    // U+20000 stays astral after NFKC: 40 code points but 80 UTF-16 units.
    const astral = "\u{20000}".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(astral).toHaveLength(2 * DISPLAY_NAME_MAX_LENGTH);
    expect(parseDisplayName(astral)).toEqual({ ok: true, value: astral });
    expect(parseDisplayName("a".repeat(DISPLAY_NAME_MAX_LENGTH))).toMatchObject({ ok: true });
  });

  it.each([
    ["empty", ""],
    ["blank", "   "],
    ["too long", "a".repeat(DISPLAY_NAME_MAX_LENGTH + 1)],
    ["control character", "tab\u0007bell"],
    ["zero-width space", "Ho\u200Bst"],
    ["word joiner", "Ho\u2060st"],
    ["soft hyphen", "Ho\u00ADst"],
    ["right-to-left override", "\u202Etsoh"],
    ["tag character", "Host\u{E0001}"],
    ["private use", "Host\uE000"],
    ["unassigned", "Host\u0378"],
    ["lone surrogate", "Bob\uD800"],
    ["emoji zero-width joiner", "👩\u200D💻"],
    ["Hangul filler", "\u3164"],
    ["halfwidth Hangul filler", "\uFFA0"],
    ["blank braille pattern", "\u2800"],
    ["musical null notehead", "Ho\u{1D159}st"],
    ["Khitan small script filler", "Ho\u{16FE4}st"],
    ["combining grapheme joiner", "Host\u034F"],
    ["variation selector", "Host\uFE0F"],
    ["supplementary variation selector", "Host\u{E0100}"],
    ["Khmer inherent vowel", "Host\u17B4"],
    ["Mongolian free variation selector", "Host\u180B"],
    ["leading combining mark", "\u0301Host"],
  ])("rejects a name with %s", (_label, input) => {
    expect(parseDisplayName(input)).toEqual({ ok: false, error: "INVALID_DISPLAY_NAME" });
  });
});

describe("canonicalDisplayName", () => {
  it("ignores case, width and extra spaces but keeps accents", () => {
    expect(canonicalDisplayName("  ÉMILE   Côté")).toBe(canonicalDisplayName("émile côté"));
    expect(canonicalDisplayName("Émile")).not.toBe(canonicalDisplayName("Emile"));
  });
});
