import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import type { BonusClientState } from "@/races/bonus-client";
import type { RaceClientState } from "@/races/race-client";
import { bonusErrorText, RaceBonuses } from "./race-bonuses";

const empty: BonusClientState = { synchronized: false, sending: false, announcements: [], fogVisible: false };
const race: RaceClientState = { entrants: [{ entrantId: "a", displayName: "<script>actor</script>" }], selfEntrantId: "a", confirming: false };
const self = { raceId: "race", revision: 1, ackSeq: 0, enabled: true, fog: null, grants: [{ milestone: 25 as const, kind: "shortenSelf" as const }] };

it.each(["fr", "en"] as const)("renders nothing when disabled, and translated, escaped activation facts in %s", locale => {
  const t = getDictionary(locale).races.bonuses;
  const render = (state: BonusClientState) => renderToStaticMarkup(createElement(RaceBonuses, { state, race, t }));
  expect(render(empty)).toBe(""); expect(render({ ...empty, self: { ...self, enabled: false } })).toBe("");
  const html = render({ ...empty, self, announcements: [{ raceId: "race", revision: 2, announcement: { type: "activated",
    receipt: { id: "race:a:25", grant: { entrantId: "a", milestone: 25, kind: "shortenSelf" }, targetId: "a", at: 100 },
  } }] });
  expect(html).toContain(t.kinds.shortenSelf); expect(html).toContain(t.next);
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
