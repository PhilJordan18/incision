import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RaceResultView } from "@incision/database";
import { asDuration } from "@incision/domain";
import { describe, expect, it } from "vitest";
import { raceCharts } from "@/i18n/race-charts";
import { RaceCharts } from "./race-charts";

const race: RaceResultView = {
  raceId: "race", roundNo: 1, state: "finished", interruptionReason: null,
  countdownAt: new Date(0), startedAt: new Date(3000), endedAt: new Date(5000),
  personalKeyErrors: { version: 1, keys: [{ grapheme: "é", count: 1 }, { grapheme: "É", count: 2 }, { grapheme: " ", count: 3 }] },
  entrants: [{ ordinal: 1, displayName: "Alice <script>", isSelf: true, result: {
    rank: 1, outcome: "finished", abandonmentReason: null, elapsedMs: 2000, position: 2, length: 2,
    netWpm: 12, rawWpm: 48, accuracy: 25, errors: 6,
    wpmSeries: { version: 1, spacingMs: 1000, points: [
      { elapsed: asDuration(0), counters: { correctInserts: 0, totalInserts: 0 }, measures: { netWpm: 0, rawWpm: 0, accuracy: 0 } },
      { elapsed: asDuration(2000), counters: { correctInserts: 2, totalInserts: 8 }, measures: { netWpm: 12, rawWpm: 48, accuracy: 25 } },
    ] },
  } }],
};
const render = (view = race, locale: "fr" | "en" = "en") => renderToStaticMarkup(createElement(RaceCharts, { race: view, locale }));

describe("private race charts", () => {
  it.each(["fr", "en"] as const)("renders actual observations and cumulative expected-character counts in %s", (locale) => {
    const html = render(race, locale);
    expect(html).toContain(raceCharts[locale].speed);
    expect(html).toContain(raceCharts[locale].heatmap);
    expect(html).toContain('points="65,245 725,30"');
    expect(html).toContain(`aria-label="é — 1 ${raceCharts[locale].count.toLowerCase()}"`);
    expect(html).toContain(`aria-label="É — 2 ${raceCharts[locale].count.toLowerCase()}"`);
    expect(html).toContain(`${raceCharts[locale].total} : 6`);
    expect(html).toContain(raceCharts[locale].space);
    expect(html).toContain("Alice &lt;script&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain('tabindex="0"');
  });
  it("does not invent a line or zero errors for a legacy result", () => {
    const { personalKeyErrors: unused, ...legacy } = race;
    void unused;
    const { wpmSeries: unusedSeries, ...result } = race.entrants[0]!.result!;
    void unusedSeries;
    const html = render({ ...legacy, entrants: [{ ...race.entrants[0]!, result }] });
    expect(html).toContain(raceCharts.en.missing);
    expect(html).not.toContain("<polyline");
    expect(html).not.toContain(raceCharts.en.zero);
    expect(html).not.toContain('aria-label="AZERTY reference"');
  });
  it("distinguishes a collected empty aggregate from missing data", () => {
    const html = render({ ...race, personalKeyErrors: { version: 1, keys: [] } });
    expect(html).toContain(raceCharts.en.zero);
    expect(html).not.toContain(raceCharts.en.missing);
  });
  it("never renders private counts for a spectator even if a malformed caller supplied them", () => {
    const html = render({ ...race, entrants: race.entrants.map((entrant) => ({ ...entrant, isSelf: false })) });
    expect(html).not.toContain(raceCharts.en.heatmap);
    expect(html).not.toContain("É — 2");
    expect(html).toContain("<polyline");
  });
  it("renders nothing for an interrupted race", () => {
    expect(render({ ...race, state: "interrupted", interruptionReason: "server_stopped" })).toBe("");
  });
  it("includes all thirty runners and gives each a readable individual view", () => {
    const html = render({ ...race, entrants: Array.from({ length: 30 }, (_, index) => ({
      ...race.entrants[0]!, ordinal: index + 1, displayName: `Runner ${index + 1}`, isSelf: index === 0,
    })) });
    expect(html.match(/<polyline/g)).toHaveLength(60);
    expect(html).toContain('aria-label="Runner Runner 30"');
  });
});
