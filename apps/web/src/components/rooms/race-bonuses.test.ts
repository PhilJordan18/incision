import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import type { BonusClientState } from "@/races/bonus-client";
import type { RaceClientState } from "@/races/race-client";
import { raceScreenMessages } from "@/i18n/dictionaries/race-screen";
import { bonusErrorText, RaceBonuses } from "./race-bonuses";

const empty: BonusClientState = { synchronized: false, sending: false, announcements: [], fogVisible: false };
const race: RaceClientState = { entrants: [{ entrantId: "a", displayName: "<script>actor</script>" }], selfEntrantId: "a", confirming: false };
const self = { raceId: "race", revision: 1, ackSeq: 0, enabled: true, fog: null, grants: [{ milestone: 25 as const, kind: "shortenSelf" as const }] };

it.each(["fr", "en"] as const)("renders nothing when disabled, and translated, escaped activation facts in %s", locale => {
  const t = getDictionary(locale).races.bonuses;
  const render = (state: BonusClientState) => renderToStaticMarkup(createElement(RaceBonuses, { state, race, t, locale }));
  expect(render(empty)).toBe(""); expect(render({ ...empty, self: { ...self, enabled: false } })).toBe("");
  const html = render({ ...empty, self, announcements: [{ raceId: "race", revision: 2, announcement: { type: "activated",
    receipt: { id: "race:a:25", grant: { entrantId: "a", milestone: 25, kind: "shortenSelf" }, targetId: "a", at: 100 },
  } }] });
  expect(html).toContain(t.kinds.shortenSelf); expect(html).toContain(t.next);
  // Name, effect and availability, not just a mark: not racing here, so not "ready".
  expect(html).toContain(raceScreenMessages[locale].bonusEffects.shortenSelf);
  expect(html).toContain(raceScreenMessages[locale].bonusWaiting); expect(html).not.toContain(raceScreenMessages[locale].bonusReady);
  expect(html).toContain(t.over);
  expect(html).toContain("&lt;script&gt;actor&lt;/script&gt;"); expect(html).not.toContain("<script>");
  expect(html).not.toContain("<button"); expect(html).not.toContain("data-warning-question");
  expect(html).toContain('aria-relevant="additions"');
});

it.each(["fr", "en"] as const)("keeps unconfirmed transport distinct from authoritative refusals in %s", locale => {
  const t = getDictionary(locale).races.bonuses;
  expect(bonusErrorText("ACK_TIMEOUT", t)).toBe(t.unconfirmed);
  expect(bonusErrorText("CONTENT_UNAVAILABLE", t)).toBe(t.contentUnavailable);
  expect(bonusErrorText("RATE_LIMITED", t)).toBe(t.rateLimited);
  expect(bonusErrorText("FOG_ALREADY_ACTIVE", t)).toBe(t.fogActive);
  expect(bonusErrorText("NO_VALID_TARGET", t)).toBe(t.noTarget);
  expect(bonusErrorText("NO_REMOVABLE_WORD", t)).toBe(t.noWord);
  expect(bonusErrorText("NOT_CONTROLLING", t)).toBe(t.observing);
  expect(bonusErrorText("SUSPENDED", t)).toBe(t.sync);
  expect(bonusErrorText("GRANT_CONSUMED", t)).toBe(t.refused);
});

it.each(["fr", "en"] as const)("says the first bonus is ready with Enter only while it can be used, in %s", locale => {
  const t = getDictionary(locale).races.bonuses;
  const text = raceScreenMessages[locale];
  const racing: RaceClientState = { ...race, control: "controlling",
    progress: { raceId: "race", revision: 1, phase: "racing", startsAt: 0, timeLimit: null, entrants: [] },
    typing: { status: "racing" } as unknown as RaceClientState["typing"] };
  const grants = [{ milestone: 25 as const, kind: "fogLeader" as const }, { milestone: 50 as const, kind: "extendLeader" as const }];
  const render = (state: BonusClientState, value = racing) => renderToStaticMarkup(createElement(RaceBonuses, { state, race: value, t, locale }));
  const ready = render({ ...empty, synchronized: true, self: { ...self, grants } });
  expect(ready).toContain(text.bonusReady); expect(ready).toContain(text.bonusQueued); expect(ready).toContain(t.hint);
  for (const kind of ["fogLeader", "extendLeader"] as const) expect(ready).toContain(text.bonusEffects[kind]);
  expect(render({ ...empty, synchronized: false, self: { ...self, grants } })).toContain(text.bonusWaiting);
  expect(render({ ...empty, synchronized: true, self: { ...self, grants } }, { ...racing, control: "observing" })).toContain(t.observing);
  // A suspended tab keeps the control but cannot type or activate: not "ready".
  const suspended = render({ ...empty, synchronized: true, self: { ...self, grants } }, { ...racing, block: "suspended" });
  expect(suspended).toContain(text.bonusWaiting); expect(suspended).not.toContain(text.bonusReady); expect(suspended).toContain(t.sync);
});
