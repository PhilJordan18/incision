import { describe, expect, it } from "vitest";
import { canonicalDisplayName, parseDisplayName } from "./display-name";

describe("parseDisplayName", () => {
  it("normalises NFKC, trims and collapses inner whitespace", () => {
    expect(parseDisplayName("  Ｅｍｉｌｅ   Côté ")).toEqual({ ok: true, value: "Emile Côté" });
  });

  it.each(["", "   ", "a".repeat(41), "tab\u0007bell"])("rejects %j", (input) => {
    expect(parseDisplayName(input)).toEqual({ ok: false, error: "INVALID_DISPLAY_NAME" });
  });
});

describe("canonicalDisplayName", () => {
  it("ignores case, width and extra spaces but keeps accents", () => {
    expect(canonicalDisplayName("  ÉMILE   Côté")).toBe(canonicalDisplayName("émile côté"));
    expect(canonicalDisplayName("Émile")).not.toBe(canonicalDisplayName("Emile"));
  });
});
