import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { RaceClientState } from "@/races/race-client";
import { raceScreenMessages } from "@/i18n/dictionaries/race-screen";
import { RaceStandings } from "./race-standings";
import { RaceTrack } from "./race-track";

const progress: NonNullable<RaceClientState["progress"]> = { raceId: "race", revision: 1, phase: "racing", startsAt: 0, timeLimit: null,
  entrants: [{ entrantId: "a", kind: "human", status: "racing", position: 4, length: 10, netWpm: 45, inactive: true },
    { entrantId: "b", kind: "bot", status: "abandoned", position: 3, length: 10, netWpm: 33, inactive: false }] };

describe("semantic track", () => {
  it.each(["fr", "en"] as const)("escapes names and provides complete text/state/bot information in %s", locale => {
    const t = getDictionary(locale).races;
    const html = renderToStaticMarkup(createElement(RaceTrack, { progress, entrants: [{ entrantId: "a", displayName: "<script>captain</script>" },
      { entrantId: "b", displayName: "Bot 2" }], selfId: "a", t, locale }));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(t.inactive); // Labelled runners' states; the full list is the standings'.
    expect(html).toContain('data-self="true"');
    expect(html).toContain('data-kind="bot"'); expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain("aria-live"); // Never announce four full lists each second.
  });
  it.each(["fr", "en"] as const)("lists every runner in the standings, furthest first, in %s", locale => {
    const t = getDictionary(locale).races;
    const html = renderToStaticMarkup(createElement(RaceStandings, { progress, entrants: [{ entrantId: "a", displayName: "<script>captain</script>" },
      { entrantId: "b", displayName: "Bot 2" }], selfId: "a", t, locale }));
    expect(html).not.toContain("<script>"); expect(html).toContain("&lt;script&gt;");
    expect(html).toContain(raceScreenMessages[locale].standingsHeading); expect(html).toContain(raceTrackMessages[locale].bot);
    expect(html.match(/<li /g)).toHaveLength(2); expect(html.match(/<progress /g)).toHaveLength(2);
    expect(html.indexOf('data-standing="a"')).toBeLessThan(html.indexOf('data-standing="b"'));
    expect(html).toContain(t.inactive); expect(html).toContain(t.status.abandoned);
    expect(html).not.toContain("aria-live");
  });
  it("draws a ship for each named runner: its kind's sail, its route's colour, my rings, the leader's ring", () => {
    const crew: NonNullable<RaceClientState["progress"]> = { ...progress, entrants: [
      { entrantId: "a", kind: "human", status: "racing", position: 4, length: 10, netWpm: 45, inactive: false },
      { entrantId: "b", kind: "bot", status: "racing", position: 8, length: 10, netWpm: 60, inactive: false },
      ...Array.from({ length: 10 }, (_, i) => ({ entrantId: `z${i}`, kind: "human" as const, status: "racing" as const, position: 0, length: 10, netWpm: 0, inactive: false }))] };
    const html = renderToStaticMarkup(createElement(RaceTrack, { progress: crew, entrants: [], selfId: "a", t: getDictionary("fr").races, locale: "fr" }));
    const marker = (id: string) => html.match(new RegExp(`<span data-runner="${id}"[^>]*>.*?</svg>`))![0];
    // Me: a human, triangle sail in `moi`, two rings. The leader: a bot, square sail, one ring.
    expect(marker("a")).toContain('data-sail="triangle"'); expect(marker("a")).toContain('data-colour="moi"');
    expect(marker("a").match(/<circle/g)).toHaveLength(2);
    expect(marker("b")).toContain('data-sail="square"'); expect(marker("b").match(/<circle/g)).toHaveLength(1);
    expect(marker("b")).toContain(`data-colour="${marker("b").match(/data-route-colour="(\w+)"/)![1]}"`);
    // Three named here (the leader, me, the runner behind me); every other runner stays a dot.
    expect(html.match(/data-ship=/g)).toHaveLength(3);
    // The chart's two words are marked.
    expect(html.match(/data-track-word=/g)).toHaveLength(2);
    expect(html.match(/data-runner=/g)).toHaveLength(12);
    // One pennant per name on the track, cut and coloured like its ship.
    expect(html.match(/data-pennant=/g)).toHaveLength(html.match(/data-ship=/g)!.length);
    expect(html).toMatch(/data-pennant="square" data-colour="\w+" data-dash="\w+"/);
    // The coast is the finish, and the finish word stays.
    expect(html).toContain('data-coast="horizontal"'); expect(html).toContain('data-coast="vertical"');
    expect(html).toContain(raceTrackMessages.fr.finish); expect(html).toContain("data-compass");
  });
  it("draws every ship on its marker, mine last so that it is painted over the others", () => {
    const level: NonNullable<RaceClientState["progress"]> = { ...progress, entrants: Array.from({ length: 12 }, (_, i) => ({ entrantId: `r${String(i).padStart(2, "0")}`,
      kind: "human" as const, status: "racing" as const, position: 5, length: 10, netWpm: 40, inactive: false })) };
    const html = renderToStaticMarkup(createElement(RaceTrack, { progress: level, entrants: [], selfId: "r05", t: getDictionary("fr").races, locale: "fr" }));
    // No berth beside the marker, no tether: a ship has nothing but its marker's position.
    expect(html).not.toMatch(/ship-shift|data-tether|data-horizontal-tether/);
    const markers = [...html.matchAll(/data-runner="(r\d+)"/g)].map(match => match[1]!);
    expect(markers).toHaveLength(12);
    expect(markers.at(-1)).toBe("r05");
  });
  it("gives every runner of the standings the pennant of its kind and route", () => {
    const html = renderToStaticMarkup(createElement(RaceStandings, { progress, entrants: [], selfId: "a", t: getDictionary("fr").races, locale: "fr" }));
    expect(html).toMatch(/data-standing="a".*?data-pennant="triangle" data-colour="moi" data-dash="solid"/);
    expect(html).toMatch(/data-standing="b".*?data-pennant="square" data-colour="juste" data-dash="solid"/);
  });
  it("renders spectators without a local marker, typing field or private images", () => {
    const html = renderToStaticMarkup(createElement(RaceTrack, { progress, entrants: [], selfId: null, t: getDictionary("en").races, locale: "en" }));
    expect(html).not.toContain('data-self="true"'); expect(html).not.toContain("<input"); expect(html).not.toContain("<img");
  });
});
