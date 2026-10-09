import { describe, expect, it } from "vitest";
import { asEntrantId, type EntrantId } from "../ids";
import { toGraphemes } from "../text/graphemes";
import { asDuration, asInstant, type Instant } from "../time";
import { EXAMPLE_ENTRANT, EXAMPLE_RACE } from "./keystrokes.examples";
import type { EntrantState, RaceState } from "./types";
import { toRaceBroadcast, toRaceReveal } from "./views";

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

  it("freezes everyone at the end of an interrupted race", () => {
    const state = race({ phase: "interrupted", endedAt: at(12_000), clock: at(12_000) });
    expect(toRaceBroadcast(state, at(24_000))).toMatchObject({ phase: "interrupted", endedAt: at(12_000) });
    expect(wpmOf(state, at(24_000), ALICE)).toBe(2);
  });

  it("omits the end instants that do not exist yet", () => {
    const broadcast = toRaceBroadcast(race(), at(12_000));
    expect(Object.keys(broadcast)).not.toContain("endedAt");
    expect(broadcast.entrants.every((entrant) => !("endedAt" in entrant))).toBe(true);
  });

  it("refuses a now that is not a valid instant, a programming error", () => {
    expect(() => toRaceBroadcast(race(), Number.NaN as Instant)).toThrow(RangeError);
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
