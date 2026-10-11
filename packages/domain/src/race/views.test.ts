import { describe, expect, it } from "vitest";
import { asEntrantId, type EntrantId } from "../ids";
import { computeMeasures } from "../measures/compute";
import { toGraphemes } from "../text/graphemes";
import { asDuration, asInstant, MAX_INSTANT, type Instant } from "../time";
import { createRace } from "./create";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE } from "./keystrokes.examples";
import { reduceRace } from "./reduce";
import type { EntrantState, InputEvent, RaceEvent, RaceState } from "./types";
import { toEntrantMeasures, toRaceBroadcast, toRaceReveal } from "./views";

const ALICE = EXAMPLE_ENTRANT;
const BOB = asEntrantId("bob");
const at = (milliseconds: number): Instant => asInstant(1_000_000 + milliseconds);

function runner(entrantId: EntrantId, overrides: Partial<EntrantState> = {}): EntrantState {
  return {
    entrantId,
    kind: "human",
    target: toGraphemes("abcde"),
    textVersion: 0,
    typed: [],
    pendingError: false,
    counters: { correctInserts: 0, totalInserts: 0 },
    missedKeys: {},
    ackSeq: 0,
    status: "racing",
    ...overrides,
  };
}

function race(overrides: Partial<RaceState> = {}): RaceState {
  return {
    raceId: EXAMPLE_RACE,
    revision: 7,
    phase: "racing",
    errorMode: "mandatory",
    timeLimit: asDuration(60_000),
    countdownAt: at(-3_000),
    startsAt: at(0),
    clock: at(10_000),
    text: toGraphemes("abcde"),
    entrants: [runner(ALICE, { typed: ["a", "b"], counters: { correctInserts: 2, totalInserts: 3 } }), runner(BOB, { kind: "bot" })],
    ...overrides,
  };
}

const wpmOf = (state: RaceState, now: Instant, entrantId: EntrantId): number | undefined =>
  toRaceBroadcast(state, now).entrants.find((entrant) => entrant.entrantId === entrantId)?.netWpm;

describe("toRaceBroadcast (F-04.1)", () => {
  it("projects the public state of every entrant, exact net WPM included", () => {
    expect(toRaceBroadcast(race(), at(12_000))).toEqual({
      raceId: EXAMPLE_RACE,
      revision: 7,
      phase: "racing",
      startsAt: at(0),
      timeLimit: 60_000,
      entrants: [
        // 2 correct inserts over 12 s: 2 × 12 000 ÷ 12 000.
        { entrantId: ALICE, kind: "human", status: "racing", position: 2, length: 5, netWpm: 2 },
        { entrantId: BOB, kind: "bot", status: "racing", position: 0, length: 5, netWpm: 0 },
      ],
    });
  });

  it("computes at the race clock when now is earlier", () => {
    expect(wpmOf(race(), at(6_000), ALICE)).toBe(wpmOf(race(), at(10_000), ALICE));
    expect(wpmOf(race(), at(10_000), ALICE)).toBe(2.4);
  });

  it("gives 0 during the countdown", () => {
    const countdown = race({ phase: "countdown", clock: at(-2_000), entrants: [runner(ALICE), runner(BOB)] });
    expect(toRaceBroadcast(countdown, at(-1_000)).entrants.map((entrant) => entrant.netWpm)).toEqual([0, 0]);
  });

  it("freezes a finisher's net WPM at their end, and shows when they ended", () => {
    const state = race({ entrants: [runner(ALICE, { typed: toGraphemes("abcde"), status: "finished", endedAt: at(6_000), counters: { correctInserts: 5, totalInserts: 5 } }), runner(BOB)] });
    expect(wpmOf(state, at(6_000), ALICE)).toBe(10);
    expect(wpmOf(state, at(600_000), ALICE)).toBe(10);
    expect(toRaceBroadcast(state, at(7_000)).entrants[0]).toMatchObject({ status: "finished", endedAt: at(6_000) });
  });

  it("gives 0 to an entrant who abandoned during the countdown, whenever it is computed", () => {
    const state = race({ entrants: [runner(ALICE, { status: "abandoned", abandonReason: "voluntary", endedAt: at(-1_000) }), runner(BOB)] });
    expect(wpmOf(state, at(30_000), ALICE)).toBe(0);
  });

  it("freezes everyone at the end of an interrupted race, and a finisher at their own end", () => {
    const finisher = runner(BOB, { typed: toGraphemes("abcde"), status: "finished", endedAt: at(6_000), counters: { correctInserts: 5, totalInserts: 5 } });
    const state = race({ phase: "interrupted", endedAt: at(12_000), clock: at(12_000), entrants: [runner(ALICE, { typed: ["a", "b"], counters: { correctInserts: 2, totalInserts: 3 } }), finisher] });
    expect(toRaceBroadcast(state, at(24_000))).toMatchObject({ phase: "interrupted", endedAt: at(12_000) });
    expect(wpmOf(state, at(24_000), ALICE)).toBe(2);
    expect(wpmOf(state, at(24_000), BOB)).toBe(10);
  });

  it("omits the end instants that do not exist yet", () => {
    const broadcast = toRaceBroadcast(race(), at(12_000));
    expect(Object.keys(broadcast)).not.toContain("endedAt");
    expect(broadcast.entrants.every((entrant) => !("endedAt" in entrant))).toBe(true);
  });

  it.each([Number.NaN, -1, MAX_INSTANT + 1, 1.5])("refuses now = %s, not a valid instant: a programming error", (now) => {
    expect(() => toRaceBroadcast(race(), now as Instant)).toThrow(RangeError);
  });
});

describe("toRaceReveal (F-04.1)", () => {
  it("reveals the text and the settings, nothing about the entrants", () => {
    expect(toRaceReveal(race())).toEqual({
      raceId: EXAMPLE_RACE,
      text: ["a", "b", "c", "d", "e"],
      errorMode: "mandatory",
      countdownAt: at(-3_000),
      startsAt: at(0),
      timeLimit: 60_000,
    });
  });

  it("reveals no time limit as null (D-17)", () => {
    expect(toRaceReveal(race({ timeLimit: null })).timeLimit).toBeNull();
  });
});

describe("toEntrantMeasures (COURSE-04)", () => {
  it("gives one entrant's exact live measures at the later of now and the clock", () => {
    // 2 correct of 3 inserts over 12 s: 2 net WPM, 3 raw WPM, 66.6…% accuracy.
    expect(toEntrantMeasures(race(), ALICE, at(12_000))).toEqual(computeMeasures({ correctInserts: 2, totalInserts: 3 }, asDuration(12_000)));
    expect(toEntrantMeasures(race(), ALICE, at(6_000))).toEqual(toEntrantMeasures(race(), ALICE, at(10_000)));
  });

  it("freezes at the entrant's end, gives 0 during the countdown, and nothing for an unknown entrant", () => {
    const finished = race({ entrants: [runner(ALICE, { typed: toGraphemes("abcde"), status: "finished", endedAt: at(6_000), counters: { correctInserts: 5, totalInserts: 5 } }), runner(BOB)] });
    expect(toEntrantMeasures(finished, ALICE, at(600_000))).toEqual({ netWpm: 10, rawWpm: 10, accuracy: 100 });
    expect(toEntrantMeasures(race({ phase: "countdown", clock: at(-2_000) }), ALICE, at(-1_000))).toMatchObject({ netWpm: 0, rawWpm: 0 });
    expect(toEntrantMeasures(race(), asEntrantId("mallory"), at(12_000))).toBeUndefined();
  });

  it.each([Number.NaN, -1, 1.5])("refuses now = %s, not a valid instant", (now) => {
    expect(() => toEntrantMeasures(race(), ALICE, now as Instant)).toThrow(RangeError);
  });

  it("gives the broadcast's net WPM for every entrant, over seeded races", () => {
    let value = 977;
    const random = (): number => {
      value = (value * 16_807) % 2_147_483_647;
      return value / 2_147_483_647;
    };
    let compared = 0;
    for (let run = 0; run < 60; run += 1) {
      const created = createRace({ raceId: EXAMPLE_RACE, text: "abc de", errorMode: random() < 0.5 ? "free" : "mandatory", timeLimit: random() < 0.5 ? null : asDuration(30_000), participants: [{ entrantId: ALICE, kind: "human" }, { entrantId: BOB, kind: "bot" }], now: at(-3_000) });
      if (!created.ok) {
        throw new Error(created.reason);
      }
      let state = created.race;
      let now = -3_000;
      for (let step = 0; step < 25; step += 1) {
        now += Math.floor(random() * 2_500);
        const entrant = state.entrants[Math.floor(random() * state.entrants.length)] ?? runner(ALICE);
        const events: InputEvent[] = Array.from({ length: 1 + Math.floor(random() * 3) }, () => (random() < 0.15 ? { type: "deleteBackward" } : { type: "insert", grapheme: "abcx "[Math.floor(random() * 5)] ?? "a" }));
        const roll = random();
        const event: RaceEvent =
          roll < 0.2 ? { type: "tick", now: at(now) } : roll < 0.25 ? { type: "abandon", entrantId: entrant.entrantId, now: at(now) } : roll < 0.27 ? { type: "interrupt", now: at(now) } : { type: "keystrokes", batch: { raceId: EXAMPLE_RACE, entrantId: entrant.entrantId, seq: entrant.ackSeq + 1, textVersion: 0, events }, now: at(now) };
        state = reduceRace(state, event).state;
        for (const probe of [state.clock - 500, state.clock, state.clock + 7_000]) {
          const broadcast = toRaceBroadcast(state, asInstant(Math.max(probe, 0)));
          for (const progress of broadcast.entrants) {
            expect(toEntrantMeasures(state, progress.entrantId, asInstant(Math.max(probe, 0)))?.netWpm).toBe(progress.netWpm);
            compared += 1;
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(5_000);
  });
});
