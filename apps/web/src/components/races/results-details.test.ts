import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RaceResultView } from "@incision/database";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import { resultsDetails } from "@/i18n/results-details";
import { formatNumber } from "@/i18n/value-format";
import { RaceResults } from "./race-results";

const race: RaceResultView = { raceId: "race", roundNo: 1, state: "finished", interruptionReason: null,
  countdownAt: new Date(0), startedAt: new Date(3000), endedAt: new Date(4000),
  entrants: [{ ordinal: 1, displayName: "Sailor", isSelf: true, result: {
    rank: 1, outcome: "finished", abandonmentReason: null, elapsedMs: 1000, position: 3, length: 3,
    netWpm: 50, rawWpm: 60, accuracy: 100, errors: Number.MAX_SAFE_INTEGER,
  } }] };
describe("exact errors and private record presentation", () => {
  it("renders exact integers, record states and category in both languages", () => {
    for (const locale of ["fr", "en"] as const) for (const status of ["first", "improved", "tied", "below"] as const) {
      const html = renderToStaticMarkup(createElement(RaceResults, { race: { ...race,
        personalRecord: { status, category: { bonuses: false, errorMode: "mandatory" } } }, locale, t: getDictionary(locale).races }));
      expect(html).toContain(formatNumber(Number.MAX_SAFE_INTEGER, locale));
      expect(html).toContain(resultsDetails[locale][status]);
      expect(html).toContain(resultsDetails[locale].mandatory);
      expect(html).toContain(resultsDetails[locale].noBonuses);
      expect(html).toContain(resultsDetails[locale].errorsHelp);
      // Gold text needs the opaque card surface in Aube, not a gold-tinted background.
      expect(html).toContain('border bg-nuit p-3');
      expect(html).not.toContain('bg-or/10');
    }
  });
  it("shows an unavailable comparison without inventing a category; hides records from spectators", () => {
    const render = (view: RaceResultView) => renderToStaticMarkup(createElement(RaceResults, { race: view, locale: "en", t: getDictionary("en").races }));
    expect(render({ ...race, personalRecord: { status: "unavailable" } })).toContain(resultsDetails.en.unavailable);
    expect(render({ ...race, personalRecord: { status: "unavailable" }, entrants: race.entrants.map((e) => ({ ...e, isSelf: false })) })).not.toContain(resultsDetails.en.unavailable);
  });
});
