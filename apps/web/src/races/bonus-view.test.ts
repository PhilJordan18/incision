import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { RaceView } from "../app/(site)/rooms/[code]/race-view";
import { getDictionary } from "../i18n/dictionaries";
import { BonusClient } from "./bonus-client";
import { RaceClient } from "./race-client";

// This layout regression exercises the hydrated wide-screen branch; real viewport transitions
// and the conservative server default are covered by mobile-keyboard.spec.ts.
vi.mock("@/components/use-narrow-screen", () => ({ useNarrowScreen: () => false }));

it("renders the effective target and progress denominator inside a fixed-height, scrollable region", () => {
  const raceId = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
  const schedule = () => () => {};
  const race = new RaceClient({ now: () => 5000, schedule });
  const bonuses = new BonusClient({ serverNow: () => 5000, schedule });
  race.reveal({ reveal: { raceId, text: [..."old"], errorMode: "mandatory", countdownAt: 0, startsAt: 3000, timeLimit: 120000 },
    language: "en", entrants: [{ entrantId: "self", displayName: "Captain" }], selfEntrantId: "self", serverNow: 5000 });
  race.self({ snapshot: { raceId, entrantId: "self", textVersion: 1, target: [..."new sea"], typed: [..."new"],
    pendingError: false, ackSeq: 1, status: "racing", counters: { correctInserts: 3, totalInserts: 3 } }, measures: { netWpm: 18, accuracy: 100 }, control: "controlling" });
  const render = () => renderToStaticMarkup(createElement(RaceView, { race, bonuses, t: getDictionary("en").races,
    locale: "en", roomLabel: "Room", expectedRaceId: raceId, reconnecting: false,
    onTakeControl: () => {}, onPresent: async () => true, onAbandon: async () => true }));
  const html = render();
  expect(html).toMatch(/Progress<\/dt><dd[^>]*>42%<\/dd>/); // floored 3 / 7, not reveal's 3 / 3.
  // The text shows the progress in a fixed-height region that scrolls (a keyboard stop of its
  // own); « Ta frappe » is the only field, under the panels' row, never inside the text.
  expect(html).toMatch(/role="region" aria-label="Text to type" tabindex="0" lang="en"[^>]*overflow-y-auto[^>]*>(?:(?!<input).)*<\/p>/);
  expect(html).toMatch(/data-race-sheet="[^"]*"[^>]*class="[^"]*\bh-60\b/);
  expect(html).toContain("course-juste");
  expect(html.match(/<input /g)).toHaveLength(1);
  expect(html.indexOf('<label for="race-typing"')).toBeGreaterThan(html.indexOf("data-race-row"));
  expect(html.indexOf('id="race-typing"')).toBeLessThan(html.indexOf("Give up the race"));
  // Out of the race (time up), the field takes no keys.
  race.self({ snapshot: { raceId, entrantId: "self", textVersion: 1, target: [..."new sea"], typed: [..."new"],
    pendingError: false, ackSeq: 2, status: "timedOut", counters: { correctInserts: 3, totalInserts: 3 } }, measures: { netWpm: 18, accuracy: 100 }, control: "controlling" });
  const ended = render();
  expect(ended).toMatch(/<input id="race-typing"[^>]*disabled/);
  expect(ended).toMatch(/role="region" aria-label="Text to type" tabindex="0"/);
});
