import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { RaceResultView } from "@incision/database";
import { sailShape } from "@/components/nautical";
import { getDictionary } from "@/i18n/dictionaries";
import type { RaceProgressPayload } from "@/races/protocol";
import { RaceCharts } from "./race-charts";
import { RaceResults } from "./race-results";
import { type ResultEntrant, resultRoutes } from "./result-routes";
import { trackLayout } from "./track-layout";

type Runner = RaceProgressPayload["broadcast"]["entrants"][number];

/** A crew large enough to use every colour and a second dash; ranks deliberately not in id order. */
const CREW = [
  { entrantId: "e-07", kind: "human", name: "Lina" },
  { entrantId: "e-02", kind: "human", name: "Capitaine" },
  { entrantId: "e-11", kind: "bot", name: "Bot 1" },
  { entrantId: "e-01", kind: "human", name: "Éli" },
  { entrantId: "e-09", kind: "bot", name: "Bot 2" },
  { entrantId: "e-04", kind: "human", name: "Noa" },
  { entrantId: "e-05", kind: "bot", name: "Bot 3" },
] as const;
const SELF = "e-02";

function entrants(withIds: boolean): readonly ResultEntrant[] {
  return CREW.map((member, index) => ({
    ...(withIds ? { entrantId: member.entrantId } : {}),
    ordinal: index + 1, displayName: member.name, kind: member.kind, isSelf: member.entrantId === SELF,
    result: { rank: index + 1, outcome: "finished", abandonmentReason: null, elapsedMs: 1000 + index, position: 3, length: 3,
      netWpm: 60 - index, rawWpm: 61, accuracy: 90, errors: 1, bonusJournal: { version: 1, grants: [] } },
  }));
}
function race(withIds: boolean): RaceResultView {
  return { raceId: "race", roundNo: 1, state: "finished", interruptionReason: null,
    countdownAt: new Date(0), startedAt: new Date(3000), endedAt: new Date(4000), entrants: entrants(withIds) };
}
/** What the track drew for the same crew, as the reader saw it during the race. */
function track() {
  const runners: Runner[] = CREW.map((member) => ({ entrantId: member.entrantId, kind: member.kind, status: "racing", position: 1, length: 3, netWpm: 40, inactive: false }));
  return new Map(trackLayout(runners, SELF).map((point) => [point.runner.entrantId, point]));
}
/** The pennant drawn inside each element marked with an entrant's ordinal. */
function pennants(html: string): Map<number, { shape: string; colour: string; dash: string }[]> {
  const found = new Map<number, { shape: string; colour: string; dash: string }[]>();
  for (const match of html.matchAll(/data-result-entrant="(\d+)"[^>]*>\s*<svg[^>]*data-pennant="(\w+)" data-colour="(\w+)" data-dash="(\w+)"/g)) {
    const ordinal = Number(match[1]);
    found.set(ordinal, [...(found.get(ordinal) ?? []), { shape: match[2]!, colour: match[3]!, dash: match[4]! }]);
  }
  return found;
}

/**
 * The stored results do not carry the race entrant id yet, so in the running app only the last
 * of these paths runs: the first two prove the match the day the projection carries it, they are
 * not evidence that the criterion "same pennant as on the track" is met.
 */
describe("result pennants", () => {
  it.each(["fr", "en"] as const)("when the projection carries the entrant id: a results row's pennant has that entrant's colour, dash and shape on the track (%s)", (locale) => {
    const t = getDictionary(locale).races;
    const html = renderToStaticMarkup(createElement(RaceResults, { race: race(true), locale, t }))
      + renderToStaticMarkup(createElement(RaceCharts, { race: race(true), locale }));
    const drawn = pennants(html);
    const points = track();
    expect(drawn.size).toBe(CREW.length);
    for (const [index, member] of CREW.entries()) {
      const point = points.get(member.entrantId)!;
      const expected = { shape: sailShape(member.kind), colour: point.route.colour, dash: point.route.dash };
      // Podium (first three), table, bonus journal and chart legend: the same pennant everywhere.
      expect(drawn.get(index + 1), member.name).toHaveLength(index < 3 ? 4 : 3);
      for (const pennant of drawn.get(index + 1)!) expect(pennant, member.name).toEqual(expected);
    }
    // The reader's own is `moi`; nobody else's is.
    expect(drawn.get(2)![0]!.colour).toBe("moi");
    expect([...drawn].filter(([, list]) => list[0]!.colour === "moi")).toHaveLength(1);
    // Two runners never share colour, dash and shape all at once in this crew.
    expect(new Set([...drawn.values()].map((list) => JSON.stringify(list[0]))).size).toBe(CREW.length);
  });

  it("when the projection carries the entrant id: takes the styles from the track's own assignment, whatever the result order", () => {
    const points = track();
    const routes = resultRoutes([...entrants(true)].reverse());
    for (const [index, member] of CREW.entries()) expect(routes.get(index + 1)).toEqual(points.get(member.entrantId)!.route);
  });

  it("as delivered today (no entrant id in the projection): only the reader has a track colour, no other runner claims one", () => {
    const routes = resultRoutes(entrants(false));
    expect([...routes.keys()]).toEqual([2]);
    expect(routes.get(2)).toEqual({ colour: "moi", dash: "solid" });
    const html = renderToStaticMarkup(createElement(RaceResults, { race: race(false), locale: "fr", t: getDictionary("fr").races }));
    const drawn = pennants(html);
    for (const [index, member] of CREW.entries()) {
      const [pennant] = drawn.get(index + 1)!;
      expect(pennant!.shape).toBe(sailShape(member.kind));
      expect(pennant!.colour).toBe(member.entrantId === SELF ? "moi" : "ecume");
      expect(pennant!.dash).toBe("solid");
    }
    // A spectator reads the race without a route of their own.
    expect(resultRoutes(entrants(false).map((entrant) => ({ ...entrant, isSelf: false }))).size).toBe(0);
  });

  it("keeps every drawing out of the accessibility tree and adds no text", () => {
    const t = getDictionary("en").races;
    const html = renderToStaticMarkup(createElement(RaceResults, { race: race(true), locale: "en", t }));
    for (const svg of html.match(/<svg[^>]*>/g) ?? []) expect(svg).toContain('aria-hidden="true"');
    expect(html).toContain('data-arrival-shore=""');
    expect(html.match(/data-coast=/g)).toHaveLength(1);
    expect(html).not.toContain("red-mist");
    const table = html.slice(html.indexOf("<table"), html.indexOf("</table>"));
    expect(table.match(/<th scope="col"/g)).toHaveLength(8);
    expect(table.match(/<th scope="row"/g)).toHaveLength(CREW.length);
  });
});
