import { LOGIN_MAX_LENGTH, PASSWORD_MAX_LENGTH } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { getDictionary } from "./dictionaries";
import { LOCALES, resolveLocale } from "./locale";

describe("resolveLocale", () => {
  it("prefers a valid explicit choice over the browser", () => {
    expect(resolveLocale("en", "fr-CA,fr;q=0.9")).toBe("en");
  });

  it.each([
    ["fr-CA,fr;q=0.9,en;q=0.8", "fr"],
    ["en-US,en;q=0.9", "en"],
    ["de-DE,en;q=0.5,fr;q=0.4", "en"],
    ["fr;q=0.2, en;q=0.8", "en"],
    ["en;q=0, fr", "fr"],
    ["*", "fr"],
    ["", "fr"],
    ["garbage;;q=x,,", "fr"],
  ])("negotiates %j as %s", (acceptLanguage, expected) => {
    expect(resolveLocale(undefined, acceptLanguage)).toBe(expected);
  });

  it("ignores an unsupported cookie value and falls back to the browser, then French", () => {
    expect(resolveLocale("de", "en")).toBe("en");
    expect(resolveLocale("<script>", null)).toBe("fr");
  });
});

describe("dictionaries", () => {
  it("state the same length limits as the domain rules in every language", () => {
    for (const locale of LOCALES) {
      const { errors } = getDictionary(locale).signIn;
      expect(errors.loginTooLong).toContain(String(LOGIN_MAX_LENGTH));
      expect(errors.passwordTooLong).toContain(String(PASSWORD_MAX_LENGTH));
    }
  });

  /** Leaf strings of a dictionary, by dotted path. */
  function leaves(value: unknown, prefix = ""): [string, unknown][] {
    if (typeof value !== "object" || value === null) {
      return [[prefix, value]];
    }
    return Object.entries(value).flatMap(([key, inner]) => leaves(inner, prefix ? `${prefix}.${key}` : key));
  }

  it("have the same keys in every locale and no empty string", () => {
    const [reference, ...others] = LOCALES.map((locale) => leaves(getDictionary(locale)));
    const paths = (entries: [string, unknown][]) => entries.map(([path]) => path).sort();
    for (const entries of others) {
      expect(paths(entries)).toEqual(paths(reference ?? []));
    }
    for (const locale of LOCALES) {
      const texts = leaves(getDictionary(locale)).map(([, text]) => text);
      expect(texts.every((text) => typeof text === "string" && text.trim().length > 0)).toBe(true);
    }
  });
});
