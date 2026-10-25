import type { ActiveCorpus } from "@incision/database";
import { asDuration, asEntrantId, asRandomState, containsLineBreak, countWords, createRaceRefusal, type Passage } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import { FIRST_RACE_SETTINGS } from "./race-service";
import { CORPUS_RETRY_MS, CorpusTexts, FIXTURE_RACE_TEXTS } from "./race-texts";

/**
 * What a keyboard of the language types directly, and nothing else: printable ASCII, plus the
 * French accented letters in French. No curly quote or apostrophe, no special space, dash or
 * ellipsis, no invisible character.
 */
const TYPABLE: Record<string, RegExp> = {
  en: /^[\x20-\x7E]+$/u,
  fr: /^[\x20-\x7EàâçéèêëîïôùûüÿÀÂÇÉÈÊËÎÏÔÙÛÜŸ]+$/u,
};

describe("the fixture texts", () => {
  it.each(Object.entries(FIXTURE_RACE_TEXTS))("%s: no line break (D-16), and the engine accepts it with the first path's settings", (_locale, { text }) => {
    expect(containsLineBreak(text)).toBe(false);
    const participants = ["a", "b"].map((id) => ({ entrantId: asEntrantId(id), kind: "human" as const }));
    expect(createRaceRefusal({ participants, text, timeLimit: asDuration(FIRST_RACE_SETTINGS.timeLimitMs) })).toBeUndefined();
  });

  it.each(Object.entries(FIXTURE_RACE_TEXTS))("%s: only characters its keyboard types directly, in their composed form, single-spaced", (locale, { text }) => {
    expect(text).toMatch(TYPABLE[locale] ?? /^$/);
    expect(text).toBe(text.normalize("NFC"));
    expect(text).toBe(text.trim());
    expect(text).not.toMatch(/ {2}/);
  });

  it("are named as fixtures and read as such, never as a corpus passage", () => {
    for (const fixture of Object.values(FIXTURE_RACE_TEXTS)) {
      expect(fixture.id).toBe("fixture");
      expect(fixture.text).toMatch(/^(Texte de test|Test text)\b/);
    }
  });
});

// Written for these tests, not corpus passages: about sixty words each, normalised.
const FRENCH: Passage = {
  id: "fr-test-depart",
  language: "fr",
  complexity: "medium",
  text: "La mer est calme ce matin. Le capitaine regarde le ciel, puis il appelle son équipage. Nous levons l'ancre avant midi, et le navire quitte le port sous un vent léger. Les mouettes crient au-dessus des vagues. Vers le soir, la côte disparaît derrière nous, et chacun reprend son poste en silence. La nuit sera longue, mais personne ne se plaint.",
};
const ENGLISH: Passage = {
  id: "en-test-departure",
  language: "en",
  complexity: "medium",
  text: "The sea was calm that morning. The captain looked at the sky, then called his crew on deck. We raised the anchor before noon, and the ship left the harbour under a light wind. Gulls cried above the waves. Towards evening the coast faded behind us, and each sailor went back to his post in silence. The night would be long, but nobody complained.",
};
const SHORT: Passage = { id: "fr-test-court", language: "fr", complexity: "medium", text: "La mer est calme ce matin, et le vent se lève à peine." };

const corpusOf = (passages: readonly Passage[], version = "test-1"): ActiveCorpus => ({ version, passages: Object.freeze(passages.map((passage) => Object.freeze({ ...passage }))) });

function corpusTexts(load: () => Promise<ActiveCorpus | undefined>) {
  const log = vi.fn<(message: string) => void>();
  const logError = vi.fn<(message: string) => void>();
  const seed = vi.fn(() => asRandomState([1, 2, 3, 4]));
  const loads = vi.fn(load);
  const clock = { now: 0 };
  const texts = new CorpusTexts({ load: loads, seed, monotonic: () => clock.now, log, logError });
  return { texts, loads, log, logError, seed, advance: (ms: number) => void (clock.now += ms) };
}

/** The first `count` words of a passage, as the engine cuts it with D-19's options (numbers off). */
const firstWords = (text: string, count: number) => text.split(" ").slice(0, count).join(" ");

describe("CorpusTexts", () => {
  it("draws a 50-word cut of a passage in the race's language, with D-19's defaults, and records where it comes from", async () => {
    const { texts, seed } = corpusTexts(async () => corpusOf([FRENCH, ENGLISH]));
    const drawn = await texts.draw("fr");
    expect(drawn).toEqual({
      ok: true,
      text: firstWords(FRENCH.text, 50),
      record: {
        language: "fr",
        text: FRENCH.id,
        corpusVersion: "test-1",
        textSettings: { kind: "coherent", language: "fr", wordCount: 50, complexity: "medium", options: { punctuation: true, numbers: false, capitals: true, accents: true } },
        textVersions: { generator: 1, criteria: "start-1", normalization: 2, prng: expect.any(String) },
      },
    });
    expect(drawn.ok && countWords(drawn.text)).toBe(50);
    expect(await texts.draw("en")).toMatchObject({ ok: true, text: firstWords(ENGLISH.text, 50), record: { language: "en", text: ENGLISH.id } });
    // A fresh state for each draw.
    expect(seed).toHaveBeenCalledTimes(2);
  });

  it("refuses when no passage serves the settings in that language, and never takes another language's or a fixture in its place", async () => {
    const { texts } = corpusTexts(async () => corpusOf([FRENCH, SHORT]));
    expect(await texts.draw("en")).toEqual({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" });
    const { texts: shortOnly } = corpusTexts(async () => corpusOf([SHORT, { ...ENGLISH, complexity: "easy" }]));
    expect(await shortOnly.draw("fr")).toEqual({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" });
    expect(await shortOnly.draw("en")).toEqual({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" });
  });

  it("loads the active version once, shared by starts arriving together, keeps it frozen, and counts what a start can draw", async () => {
    let version = "test-1";
    // SHORT is retained but too short for D-19's 50 words: not counted.
    const { texts, loads, log } = corpusTexts(async () => corpusOf([FRENCH, SHORT, ENGLISH], version));
    const [first, second] = await Promise.all([texts.draw("fr"), texts.draw("en")]);
    version = "test-2";
    const third = await texts.draw("fr");
    for (const drawn of [first, second, third]) expect(drawn).toMatchObject({ ok: true, record: { corpusVersion: "test-1" } });
    expect(loads).toHaveBeenCalledTimes(1);
    expect(log.mock.calls).toEqual([["[races] corpus test-1: 1 fr, 1 en selectable passages"]]);
  });

  it("refuses while no version is active, says so once, reads again at most every CORPUS_RETRY_MS, and serves the first version imported without a restart", async () => {
    const database: { active?: ActiveCorpus } = {};
    const { texts, loads, log, advance } = corpusTexts(async () => database.active);
    await texts.warm();
    expect(await texts.draw("fr")).toEqual({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" });
    expect(loads).toHaveBeenCalledTimes(1);
    database.active = corpusOf([FRENCH, ENGLISH]);
    advance(CORPUS_RETRY_MS - 1);
    expect(await texts.draw("fr")).toEqual({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" });
    expect(loads).toHaveBeenCalledTimes(1);
    advance(1);
    expect(await texts.draw("fr")).toMatchObject({ ok: true, record: { text: FRENCH.id, corpusVersion: "test-1" } });
    expect(loads).toHaveBeenCalledTimes(2);
    expect(log.mock.calls).toEqual([
      ["[races] corpus: no active version, starts refused until one is imported (docs/DEPLOYMENT.md)"],
      ["[races] corpus test-1: 1 fr, 1 en selectable passages"],
    ]);
  });

  it("answers UNAVAILABLE while the load fails, shares one read between starts, logs a failure once, and loads again after CORPUS_RETRY_MS", async () => {
    let fail = true;
    const { texts, loads, logError, advance } = corpusTexts(async () => {
      if (fail) throw new Error("Corpus version test-1 no longer matches its checksum");
      return corpusOf([FRENCH, ENGLISH]);
    });
    await texts.warm();
    // Starts arriving together during the delay, then after it: one read each time.
    expect(await Promise.all([texts.draw("fr"), texts.draw("en")])).toEqual([
      { ok: false, reason: "UNAVAILABLE" },
      { ok: false, reason: "UNAVAILABLE" },
    ]);
    expect(loads).toHaveBeenCalledTimes(1);
    advance(CORPUS_RETRY_MS);
    expect(await Promise.all([texts.draw("fr"), texts.draw("en")])).toEqual([
      { ok: false, reason: "UNAVAILABLE" },
      { ok: false, reason: "UNAVAILABLE" },
    ]);
    expect(loads).toHaveBeenCalledTimes(2);
    // The same failure again is not logged again.
    expect(logError.mock.calls).toEqual([["[races] corpus: load failed, starts refused until it loads: Corpus version test-1 no longer matches its checksum"]]);
    fail = false;
    advance(CORPUS_RETRY_MS);
    expect(await texts.draw("fr")).toMatchObject({ ok: true, record: { corpusVersion: "test-1" } });
    expect(loads).toHaveBeenCalledTimes(3);
  });

  it("answers UNAVAILABLE when the engine refuses the corpus at the draw, and logs the passage id, never its text", async () => {
    const broken: Passage = { ...FRENCH, id: "fr-test-espaces", text: FRENCH.text.replace(" ", "  ") };
    const { texts, logError } = corpusTexts(async () => corpusOf([broken, ENGLISH]));
    expect(await texts.draw("fr")).toEqual({ ok: false, reason: "UNAVAILABLE" });
    expect(logError).toHaveBeenCalledTimes(1);
    const [message] = logError.mock.calls[0] ?? [];
    expect(message).toMatch(/^\[races\] corpus test-1: draw failed: .*fr-test-espaces/);
    expect(message).not.toContain("La mer est calme");
  });
});
