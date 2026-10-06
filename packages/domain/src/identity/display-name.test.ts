import { describe, expect, it } from "vitest";
import { canonicalDisplayName, DISPLAY_NAME_MAX_LENGTH, parseDisplayName } from "./display-name";

describe("parseDisplayName", () => {
  it("normalises NFKC, trims and collapses inner whitespace", () => {
    expect(parseDisplayName("  Ｅｍｉｌｅ   Côté ")).toEqual({ ok: true, value: "Emile Côté" });
  });

  it("counts code points like PostgreSQL char_length, so 40 astral characters fit", () => {
    const astral = "𝒜".repeat(DISPLAY_NAME_MAX_LENGTH);
    expect(parseDisplayName(astral)).toEqual({ ok: true, value: astral.normalize("NFKC") });
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
