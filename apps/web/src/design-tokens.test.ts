import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** Every source file of the app, except tests. */
function sourceFiles(folder: string): string[] {
  return readdirSync(folder).flatMap((entry) => {
    const file = path.join(folder, entry);
    if (statSync(file).isDirectory()) {
      return sourceFiles(file);
    }
    return /\.(tsx?|css)$/.test(entry) && !entry.includes(".test.") ? [file] : [];
  });
}

/** Colours written outside the tokens: hex, CSS colour functions, Tailwind's default palette. */
const FORBIDDEN_COLOURS = [
  /#[0-9a-fA-F]{3,8}\b/g,
  /\b(?:rgba?|hsla?|oklch|oklab|lab|lch)\(/g,
  /\b(?:bg|text|border|outline|ring|fill|stroke|decoration|from|via|to|shadow|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black)(?:-\d{2,3})?\b/g,
];

describe("design rules (apps/design/README.md §2)", () => {
  it("writes no colour outside apps/design/tokens.css (text-white only, for the primary button)", () => {
    const offenders = sourceFiles(import.meta.dirname).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN_COLOURS.flatMap((pattern) =>
        [...source.matchAll(pattern)].map((match) => `${path.relative(import.meta.dirname, file)}: ${match[0]}`),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("would catch the colours it forbids", () => {
    const samples = ["#fff", "#05070D80", "rgb(1, 2, 3)", "oklch(0.5 0.1 20)", "text-red-700", "bg-zinc-50", "border-black"];
    for (const sample of samples) {
      expect(FORBIDDEN_COLOURS.some((pattern) => new RegExp(pattern.source).test(sample))).toBe(true);
    }
    expect(FORBIDDEN_COLOURS.some((pattern) => new RegExp(pattern.source).test("text-white bg-action #main"))).toBe(false);
  });
});
