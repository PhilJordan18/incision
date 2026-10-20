import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { applyKeystrokes } from "../race/keystrokes";
import { MAX_TEXT_GRAPHEMES } from "../race/limits";
import { reduceRace } from "../race/reduce";
import type { EntrantState, RaceState } from "../race/types";
import { toEntrantMeasures, toRaceBroadcast } from "../race/views";
import { toGraphemes } from "../text/graphemes";
import { countWords } from "../text/words";
import { asInstant, MAX_INSTANT } from "../time";
import { applyBonusEffect, bonusFogActive, type BonusEffect, type BonusEffectInput } from "./effects";

const raceId = asRaceId("race");
const alice = asEntrantId("alice");
const bob = asEntrantId("bob");
const now = asInstant(10_000);
const text = "un deux trois quatre cinq six";

function entrant(id = alice, position = 1, target = text): EntrantState {
  return {
    entrantId: id, kind: "human", target: toGraphemes(target), textVersion: 0,
    typed: toGraphemes(target).slice(0, position), pendingError: false,
    counters: { totalInserts: position + 1, correctInserts: position },
    missedKeys: { x: 1 }, ackSeq: 1, status: "racing", lastActivityAt: now, inactive: false,
  };
}

function input(effect: BonusEffect, entrants: readonly EntrantState[] = [entrant(), entrant(bob, 8)]): BonusEffectInput {
  const race: RaceState = {
    raceId, revision: 4, phase: "racing", errorMode: "mandatory", timeLimit: null,
    countdownAt: asInstant(0), startsAt: asInstant(3_000), clock: now, text: toGraphemes(text), entrants,
  };
  return { raceId, actorId: alice, race, now, effect };
}
const shorten = (protectedPosition = 1): BonusEffect => ({ kind: "shortenSelf", protectedPosition });
const extend: BonusEffect = { kind: "extendLeader", words: ["mer", "bateau", "port"] };

describe("pure bonus effects (not an activation endpoint)", () => {
  it("removes three suffix words and changes only target and textVersion", () => {
    const value = input(shorten());
    const result = applyBonusEffect(value);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entrant.target.join("")).toBe("un deux trois");
    expect(result.entrant).toEqual({ ...value.race.entrants[0], target: toGraphemes("un deux trois"), textVersion: 1 });
  });

  it.each([0, 1, 2, 3, 4, 6, 7, 8, 13, 14, 20, 26])("preserves current and previously started words at position %i", (position) => {
    const player = entrant(alice, position);
    const result = applyBonusEffect(input(shorten(position), [player, entrant(bob)]));
    if (result.ok) {
      const next = result.entrant.target.join("");
      expect(text.startsWith(next)).toBe(true);
      expect(result.entrant.target.length).toBeGreaterThan(position);
      expect(countWords(text) - countWords(next)).toBeGreaterThanOrEqual(1);
      expect(countWords(text) - countWords(next)).toBeLessThanOrEqual(3);
      // Independent boundary check: cannot cut inside the word at the protected position.
      const end = text.indexOf(" ", position);
      expect(next.length).toBeGreaterThanOrEqual(end < 0 ? text.length : end);
    } else expect(result.reason).toBe("NO_REMOVABLE_WORD");
  });

  it("protects a word reached earlier even after backspacing", () => {
    const result = applyBonusEffect(input(shorten(15)));
    expect(result.ok && result.entrant.target.join("")).toBe("un deux trois quatre");
  });

  it("preserves the expected space and pending mandatory error", () => {
    const player = { ...entrant(alice, 13), pendingError: true };
    const result = applyBonusEffect(input(shorten(13), [player, entrant(bob)]));
    expect(result.ok && result.entrant.target.join("")).toBe("un deux trois quatre");
    expect(result.ok && result.entrant.pendingError).toBe(true);
  });

  it("never manufactures an arrival on the final word", () => {
    expect(applyBonusEffect(input(shorten(text.length - 1), [entrant(alice, text.length - 1), entrant(bob)])))
      .toEqual({ ok: false, reason: "NO_REMOVABLE_WORD" });
  });

  it("counts punctuation tokens correctly and refuses an unsafe quoted cut", () => {
    const safe = applyBonusEffect(input(shorten(), [entrant(alice, 1, "mer ! port quai pont"), entrant(bob)]));
    expect(safe.ok && safe.entrant.target.join("")).toBe("mer !");
    const quoted = applyBonusEffect(input(shorten(), [entrant(alice, 1, '"mer port quai pont"'), entrant(bob)]));
    expect(quoted).toEqual({ ok: false, reason: "NO_REMOVABLE_WORD" });
  });

  it("keeps Unicode graphemes and free-mode errors untouched", () => {
    const player = { ...entrant(alice, 1, "été cœur île port quai"), typed: ["x"] };
    const result = applyBonusEffect(input(shorten(), [player, entrant(bob)]));
    expect(result.ok && result.entrant.target.join("")).toBe("été cœur");
    expect(result.ok && result.entrant.typed).toEqual(["x"]);
  });

  it("appends exactly three words to the active leader, not a terminal leader", () => {
    const finished = { ...entrant(asEntrantId("finished"), text.length), status: "finished" as const };
    const result = applyBonusEffect(input(extend, [finished, entrant(), entrant(bob, 8)]));
    expect(result.ok && result.entrant.entrantId).toBe(bob);
    expect(result.ok && result.entrant.target.join("")).toBe(`${text} mer bateau port`);
  });

  it("breaks exact progress ties by ID, independent of roster order", () => {
    const players = [entrant(), entrant(bob, 8), entrant(asEntrantId("charlie"), 8)];
    for (const roster of [players, [...players].reverse(), [players[1]!, players[0]!, players[2]!]]) {
      const result = applyBonusEffect(input(extend, roster));
      expect(result.ok && result.entrant.entrantId).toBe(bob);
    }
  });

  it("compares ratios rather than raw positions", () => {
    const result = applyBonusEffect(input(extend, [entrant(), entrant(bob, 2, "abc"), entrant(asEntrantId("charlie"), 8)]));
    expect(result.ok && result.entrant.entrantId).toBe(bob);
  });

  it("requires a target strictly ahead", () => {
    expect(applyBonusEffect(input(extend, [entrant(), entrant(bob, 1)]))).toEqual({ ok: false, reason: "NO_VALID_TARGET" });
  });

  it.each([[], ["a"], ["a", "b", "c", "d"], ["a b", "c", "d"], ["a", "?", "c"], ["a", "b\n", "c"], ["a", "e\u0301", "c"]].map((words) => ({ words })))
  ("refuses invalid extension $words", ({ words }) => {
    expect(applyBonusEffect(input({ kind: "extendLeader", words }))).toEqual({ ok: false, reason: "INVALID_EXTENSION" });
  });

  it("refuses hard length overflow, without truncating or mutating", () => {
    const value = input(extend, [entrant(), entrant(bob, 2_000, "a".repeat(MAX_TEXT_GRAPHEMES))]);
    const before = JSON.stringify(value);
    expect(applyBonusEffect(value)).toEqual({ ok: false, reason: "TEXT_TOO_LONG" });
    expect(JSON.stringify(value)).toBe(before);
  });

  it("does not cap an effective text at the initial configured word count", () => {
    const result = applyBonusEffect(input(extend, [entrant(), entrant(bob, 10, Array(200).fill("mer").join(" "))]));
    // This entrant is behind Alice; make the actor start at zero.
    const active = input(extend, [entrant(alice, 0), entrant(bob, 10, Array(200).fill("mer").join(" "))]);
    expect(result.ok).toBe(false);
    const next = applyBonusEffect(active);
    expect(next.ok && countWords(next.entrant.target.join(""))).toBe(203);
  });

  it("keeps exact measures at the same instant while changing effective progress", () => {
    const value = input(shorten());
    const result = applyBonusEffect(value);
    if (!result.ok) throw new Error(result.reason);
    const after = { ...value.race, entrants: [result.entrant, value.race.entrants[1]!] };
    expect(toEntrantMeasures(after, alice, now)).toEqual(toEntrantMeasures(value.race, alice, now));
    expect(toRaceBroadcast(after, now).entrants[0]?.length).toBe(13);
  });

  it("old textVersion resynchronizes without consuming seq; refreshed input succeeds", () => {
    const value = input(shorten());
    const result = applyBonusEffect(value);
    if (!result.ok) throw new Error(result.reason);
    const batch = { raceId, entrantId: alice, seq: 2, textVersion: 0, events: [{ type: "insert" as const, grapheme: "n" }] };
    const context = { phase: "racing" as const, errorMode: "mandatory" as const, startsAt: asInstant(3_000), now };
    const stale = applyKeystrokes(result.entrant, batch, context);
    expect(stale.result.outcome).toBe("resync");
    expect(stale.entrant.ackSeq).toBe(1);
    expect(applyKeystrokes(result.entrant, { ...batch, textVersion: 1 }, context).result.outcome).toBe("applied");
  });

  it("fog is exactly three seconds, never stacks, and leaves the entrant untouched", () => {
    const value = input({ kind: "fogLeader" });
    const first = applyBonusEffect(value);
    if (!first.ok || first.fog === undefined) throw new Error("Expected fog");
    expect(first.entrant).toBe(value.race.entrants[1]);
    expect(bonusFogActive(first.fog, asInstant(9_999))).toBe(false);
    expect(bonusFogActive(first.fog, asInstant(12_999))).toBe(true);
    expect(bonusFogActive(first.fog, asInstant(13_000))).toBe(false);
    expect(applyBonusEffect({ ...value, effect: { kind: "fogLeader", existingFog: first.fog } }))
      .toEqual({ ok: false, reason: "FOG_ALREADY_ACTIVE" });
    expect(applyBonusEffect({ ...value, now: asInstant(13_000), race: { ...value.race, clock: asInstant(13_000) },
      effect: { kind: "fogLeader", existingFog: first.fog } }).ok).toBe(true);
  });

  it("refuses clock overflow and stale clocks", () => {
    const value = input({ kind: "fogLeader" });
    expect(applyBonusEffect({ ...value, now: asInstant(MAX_INSTANT), race: { ...value.race, clock: asInstant(MAX_INSTANT) } }))
      .toEqual({ ok: false, reason: "INVALID_TIME" });
    expect(applyBonusEffect({ ...value, now: asInstant(9_999) })).toEqual({ ok: false, reason: "INVALID_TIME" });
  });

  it("refuses wrong race, absent actor, terminal actor, ended race and version overflow", () => {
    const value = input(shorten());
    expect(applyBonusEffect({ ...value, raceId: asRaceId("other") })).toEqual({ ok: false, reason: "WRONG_RACE" });
    expect(applyBonusEffect({ ...value, actorId: asEntrantId("missing") })).toEqual({ ok: false, reason: "UNKNOWN_ENTRANT" });
    expect(applyBonusEffect({ ...value, race: { ...value.race, phase: "ended" } })).toEqual({ ok: false, reason: "NOT_RACING" });
    expect(applyBonusEffect(input(shorten(), [{ ...entrant(), status: "abandoned" }, entrant(bob)])))
      .toEqual({ ok: false, reason: "ENTRANT_TERMINAL" });
    expect(applyBonusEffect(input(shorten(), [{ ...entrant(), textVersion: Number.MAX_SAFE_INTEGER }, entrant(bob)])))
      .toEqual({ ok: false, reason: "TEXT_VERSION_EXHAUSTED" });
  });

  it.each([-1, 0, 1.5, NaN, text.length + 1])("refuses invalid protected position %s", (position) => {
    expect(applyBonusEffect(input(shorten(position)))).toEqual({ ok: false, reason: "INVALID_PROTECTED_POSITION" });
  });

  it("has identical output after JSON round-trip and never mutates frozen input", () => {
    const value = input(extend);
    const copy = JSON.parse(JSON.stringify(value)) as BonusEffectInput;
    const freeze = (item: object): void => {
      Object.freeze(item);
      for (const child of Object.values(item)) if (child !== null && typeof child === "object") freeze(child);
    };
    freeze(value);
    expect(applyBonusEffect(value)).toEqual(applyBonusEffect(copy));
  });

  it("checks every position/high-water pair against an independent suffix oracle", () => {
    const words = text.split(" ");
    for (let position = 0; position < text.length; position += 1) {
      for (let high = position; high <= text.length; high += 1) {
        const keep = Math.max(high, position + 1);
        const candidates = [3, 2, 1].map((removed) => words.slice(0, words.length - removed).join(" "));
        const expected = candidates.find((candidate) => candidate.length >= keep);
        const result = applyBonusEffect(input(shorten(high), [entrant(alice, position), entrant(bob)]));
        if (expected === undefined) expect(result).toEqual({ ok: false, reason: "NO_REMOVABLE_WORD" });
        else expect(result.ok && result.entrant.target.join("")).toBe(expected);
      }
    }
  });

  it("composes with the real reducer: finishing uses effective length and actual counters", () => {
    const value = input(shorten());
    const result = applyBonusEffect(value);
    if (!result.ok) throw new Error(result.reason);
    const race: RaceState = {
      ...value.race,
      entrants: [result.entrant, { ...entrant(bob), status: "abandoned", endedAt: now, abandonReason: "voluntary" }],
    };
    const reduced = reduceRace(race, {
      type: "keystrokes", now,
      batch: { raceId, entrantId: alice, seq: 2, textVersion: 1,
        events: result.entrant.target.slice(1).map((grapheme) => ({ type: "insert", grapheme })) },
    });
    expect(reduced.ended?.results[0]?.length).toBe(13);
    expect(reduced.ended?.results[0]?.status).toBe("finished");
    expect(reduced.ended?.results[0]?.counters).toEqual({ totalInserts: 14, correctInserts: 13 });
  });

  it("refuses malformed roster and duplicate identities before targeting", () => {
    expect(applyBonusEffect(input(extend, [entrant(), entrant()]))).toEqual({ ok: false, reason: "INVALID_STATE" });
    expect(applyBonusEffect(input(extend, [entrant(), { ...entrant(bob), target: [] }]))).toEqual({ ok: false, reason: "INVALID_STATE" });
    expect(applyBonusEffect(input(extend, [entrant(), { ...entrant(bob), textVersion: -1 }]))).toEqual({ ok: false, reason: "INVALID_STATE" });
  });

  it("rejects fog from another race or target and invalid intervals", () => {
    for (const patch of [{ raceId: asRaceId("other") }, { entrantId: alice }, { expiresAt: asInstant(14_000) }, { startsAt: asInstant(11_000), expiresAt: asInstant(14_000) }]) {
      const existingFog = { raceId, entrantId: bob, startsAt: now, expiresAt: asInstant(13_000), ...patch };
      expect(applyBonusEffect(input({ kind: "fogLeader", existingFog }))).toEqual({ ok: false, reason: "INVALID_STATE" });
    }
  });

  it("allows the last representable complete fog interval but no invalid visibility time", () => {
    const value = input({ kind: "fogLeader" });
    const at = asInstant(MAX_INSTANT - 3_000);
    const result = applyBonusEffect({ ...value, now: at, race: { ...value.race, clock: at } });
    if (!result.ok || result.fog === undefined) throw new Error("Expected fog");
    expect(result.fog.expiresAt).toBe(MAX_INSTANT);
    expect(bonusFogActive(result.fog, NaN as typeof now)).toBe(false);
  });
});
