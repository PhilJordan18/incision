import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ProfileStatisticsPanel } from "./profile-statistics";

it("renders storage failure separately from empty history, in both languages", () => {
  for (const locale of ["fr", "en"] as const) {
    const unavailable = renderToStaticMarkup(createElement(ProfileStatisticsPanel, { data: null, locale }));
    expect(unavailable).toContain('role="alert"');
    expect(unavailable).not.toContain("data-stat");
    const empty = renderToStaticMarkup(createElement(ProfileStatisticsPanel, { locale, data: {
      summary: { raceCount: 0, victories: 0, bestNetWpm: null, averageNetWpm: null, averageAccuracy: null }, trend: [],
    } }));
    expect(empty).toContain('data-stat="races"');
    expect(empty).not.toContain('role="alert"');
    expect(empty).not.toContain("<svg");
  }
});

it("renders a real zero as a single point, without an invented line, with an HTML table", () => {
  const html = renderToStaticMarkup(createElement(ProfileStatisticsPanel, { locale: "en", data: {
    summary: { raceCount: 1, victories: 0, bestNetWpm: null, averageNetWpm: 0, averageAccuracy: 0 },
    trend: [{ raceId: "race", endedAt: "2026-10-25T10:00:00.000000Z", outcome: "abandoned", netWpm: 0, accuracy: 0 }],
  } }));
  expect(html).toContain("<circle"); expect(html).not.toContain("<polyline");
  expect(html).toContain("Abandoned"); expect(html).toContain("<table");
  expect(html).not.toMatch(/NaN|Infinity/);
});
