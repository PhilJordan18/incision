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
  /\b(?:bg|text|border|outline|ring|ring-offset|divide|fill|stroke|decoration|from|via|to|shadow|accent|caret|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-\d{2,3})?\b/g,
];

/** The one exception: white text on the red primary button (apps/design/README.md §3, primary button). */
const ALLOWED = { file: path.join("components", "ui", "styles.ts"), colour: "text-white" };

describe("design rules (apps/design/README.md §2)", () => {
  it("writes no colour outside apps/design/tokens.css (text-white only, for the primary button)", () => {
    const offenders = sourceFiles(import.meta.dirname).flatMap((file) => {
      const source = readFileSync(file, "utf8");
      const relative = path.relative(import.meta.dirname, file);
      return FORBIDDEN_COLOURS.flatMap((pattern) =>
        [...source.matchAll(pattern)]
          .filter((match) => !(relative === ALLOWED.file && match[0] === ALLOWED.colour))
          .map((match) => `${relative}: ${match[0]}`),
      );
    });
    expect(offenders).toEqual([]);
  });

  it("would catch the colours it forbids", () => {
    const samples = [
      "#fff",
      "#05070D80",
      "rgb(1, 2, 3)",
      "oklch(0.5 0.1 20)",
      "text-red-700",
      "bg-zinc-50",
      "border-black",
      "bg-white",
      "text-white",
      "divide-gray-200",
      "ring-offset-white",
    ];
    for (const sample of samples) {
      expect(FORBIDDEN_COLOURS.some((pattern) => new RegExp(pattern.source).test(sample))).toBe(true);
    }
    expect(FORBIDDEN_COLOURS.some((pattern) => new RegExp(pattern.source).test("text-ecume bg-action #main"))).toBe(false);
  });
});
