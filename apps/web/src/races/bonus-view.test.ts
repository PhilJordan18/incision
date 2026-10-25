import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { RaceView } from "../app/(site)/rooms/[code]/race-view";
import { getDictionary } from "../i18n/dictionaries";
import { BonusClient } from "./bonus-client";
import { RaceClient } from "./race-client";

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
  expect(html).toContain('role="region" aria-label="Text to type" tabindex="0"');
  expect(html).toContain("flex h-60 flex-col"); expect(html).toContain("overflow-y-auto");
  expect(html).toContain("course-juste");
});
