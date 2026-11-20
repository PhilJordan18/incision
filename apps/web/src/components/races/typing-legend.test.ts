import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { TypingLegend } from "./typing-legend";
import { typingLegendMessages } from "@/i18n/typing-legend";

it("does not invent a mode before the server reveal", () => {
  expect(renderToStaticMarkup(createElement(TypingLegend, { mode: undefined, locale: "fr" }))).toBe("");
});

for (const locale of ["fr", "en"] as const) {
  for (const mode of ["mandatory", "free"] as const) {
    it(`explains ${mode} in ${locale} without live announcements or controls`, () => {
      const html = renderToStaticMarkup(createElement(TypingLegend, { mode, locale }));
      const t = typingLegendMessages[locale];
      expect(html).toContain(t[mode]);
      expect(html).toContain(mode === "mandatory" ? t.blocked : t.wrong);
      expect(html).not.toContain(mode === "mandatory" ? t.wrong : t.blocked);
      expect(html).toContain(t.correct);
      expect(html).toContain(t.cursor);
      expect(html).not.toMatch(/aria-live|role="(?:status|alert)"|<input|<button/);
      expect(html.match(/aria-hidden="true"/g)).toHaveLength(3);
    });
  }
}
