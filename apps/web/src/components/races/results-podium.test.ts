import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { EntrantResultView, RaceResultView } from "@incision/database";
import { getDictionary } from "@/i18n/dictionaries";
import { ResultsPodium } from "./results-podium";
import { RaceResults } from "./race-results";

function entrant(rank: number, outcome: "finished" | "timed_out" | "abandoned" = "finished"): EntrantResultView {
  return { ordinal: rank, displayName: `Sailor-${rank}`, isSelf: rank === 2,
    result: { rank, outcome, abandonmentReason: outcome === "abandoned" ? "voluntary" : null,
      elapsedMs: 1000, position: 3, length: 3, netWpm: rank * 10, rawWpm: 12.5, accuracy: 90, errors: 1 } };
}
function podium(entrants: readonly EntrantResultView[], locale: "en" | "fr" = "en") {
  return renderToStaticMarkup(createElement(ResultsPodium, { entrants, locale, t: getDictionary(locale).races }));
}
describe("persisted results podium", () => {
  it("shows only existing places, including zero, one and two-result races", () => {
    expect(podium([])).toBe("");
    expect(podium([{ ordinal: 1, displayName: "Waiting", isSelf: true }])).toBe("");
    for (const count of [1, 2, 3, 4]) {
      const html = podium(Array.from({ length: count }, (_, i) => entrant(i + 1)));
      expect(html.match(/<li /g)).toHaveLength(Math.min(count, 3));
      expect(html).not.toContain("Sailor-4");
    }
  });
  it("uses stored rank even with higher WPM in lower places and does not mutate the input", () => {
    const input = Object.freeze([entrant(3), entrant(1), entrant(2)]);
    const html = podium(input);
    expect(html.indexOf("Sailor-1")).toBeLessThan(html.indexOf("Sailor-2"));
    expect(html.indexOf("Sailor-2")).toBeLessThan(html.indexOf("Sailor-3"));
    expect(input[0]!.ordinal).toBe(3);
  });
  it("labels non-finishers instead of presenting them as winners, in both languages", () => {
    for (const locale of ["fr", "en"] as const) {
      const t = getDictionary(locale).races;
      const html = podium([entrant(1, "timed_out"), entrant(2, "abandoned")], locale);
      expect(html).toContain(t.status.timedOut); expect(html).toContain(t.status.abandoned);
      expect(html).toContain(t.abandonReasons.voluntary); expect(html).not.toContain("border-or");
    }
  });
  it("preserves no-victory messaging, spectator state and the raw WPM table column", () => {
    const race: RaceResultView = { raceId: "race", roundNo: 1, state: "finished", interruptionReason: null,
      countdownAt: new Date(0), startedAt: new Date(3000), endedAt: new Date(4000),
      entrants: [{ ...entrant(1, "abandoned"), isSelf: false }] };
    for (const locale of ["fr", "en"] as const) {
      const t = getDictionary(locale).races;
      const html = renderToStaticMarkup(createElement(RaceResults, { race, locale, t }));
      expect(html).toContain(t.results.noVictory); expect(html).toContain(t.results.spectator);
      const table = html.slice(html.indexOf("<table"));
      expect(table).toContain(t.results.columns.rawWpm);
      expect(table.match(/<th scope="col"/g)).toHaveLength(8);
    }
  });
});
