import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOGIN_MAX_LENGTH, PASSWORD_MAX_LENGTH } from "@incision/domain";
import { getDictionary } from "./i18n/dictionaries";
import { LOCALES } from "./i18n/locale";

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

describe("design rules", () => {
  it("writes no hexadecimal colour outside apps/design/tokens.css (apps/design/README.md §2)", () => {
    const offenders = sourceFiles(import.meta.dirname).flatMap((file) =>
      [...readFileSync(file, "utf8").matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3}(?:[0-9a-fA-F]{2})?)?\b/g)].map(
        (match) => `${path.relative(import.meta.dirname, file)}: ${match[0]}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("states the same length limits as the domain rules in every language", () => {
    for (const locale of LOCALES) {
      const { errors } = getDictionary(locale).signIn;
      expect(errors.loginTooLong).toContain(String(LOGIN_MAX_LENGTH));
      expect(errors.passwordTooLong).toContain(String(PASSWORD_MAX_LENGTH));
    }
  });
});
