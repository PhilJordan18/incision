import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getDictionary } from "@/i18n/dictionaries";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import type { RaceClientState } from "@/races/race-client";
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
    expect(html).toContain(t.inactive); expect(html).toContain(t.status.abandoned);
    expect(html).toContain(raceTrackMessages[locale].all); expect(html).toContain(raceTrackMessages[locale].bot);
    expect(html.match(/<li /g)).toHaveLength(2); expect(html).toContain('data-self="true"');
    expect(html).toContain('data-kind="bot"'); expect(html).toContain("<details");
    expect(html).not.toContain("aria-live"); // Never announce four full lists each second.
  });
  it("renders spectators without a local marker, typing field or private images", () => {
    const html = renderToStaticMarkup(createElement(RaceTrack, { progress, entrants: [], selfId: null, t: getDictionary("en").races, locale: "en" }));
    expect(html).not.toContain('data-self="true"'); expect(html).not.toContain("<input"); expect(html).not.toContain("<img");
  });
});
