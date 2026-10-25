import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { asDuration, asInstant } from "../time";
import { BOT_LEVELS } from "../bots/profiles";
import { simulateRace, type SimulationInput } from "../index";
import { computeMeasures } from "../measures/compute";

const HUMAN = asEntrantId("demo-human");
const BOT = asEntrantId("demo-bot");
const RACE = asRaceId("demo-race");
function input(): SimulationInput {
  return {
    race: { raceId: RACE, text: "Le navire quitte le port.", errorMode: "mandatory", timeLimit: null, now: asInstant(0),
      participants: [{ entrantId: HUMAN, kind: "human" }, { entrantId: BOT, kind: "bot" }] },
    bots: [{ entrantId: BOT, level: "expert", seed: [1, 2, 3, 4] }],
    humanEvents: [{ type: "abandon", entrantId: HUMAN, now: asInstant(3000) }],
  };
}

describe("offline seeded race simulation", () => {
  it.each(BOT_LEVELS)("finishes both correction modes through the real engine: %s", (level) => {
    for (const errorMode of ["mandatory", "free"] as const) {
      const setup = input();
      const result = simulateRace({ ...setup, race: { ...setup.race, errorMode }, bots: [{ ...setup.bots[0]!, level }] });
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error(result.reason);
      expect(result.race.phase).toBe("ended");
      expect(result.race.entrants[0]).toMatchObject({ status: "abandoned", abandonReason: "voluntary" });
      const bot = result.race.entrants[1]!;
      expect(bot.status).toBe("finished");
      expect(bot.counters.totalInserts).toBeGreaterThanOrEqual(bot.target.length);
      if (errorMode === "mandatory") expect(bot.typed).toEqual(bot.target);
      expect(result.end.results).toHaveLength(2);
      expect(result.end.results[0]).toMatchObject({ entrantId: BOT, rank: 1, status: "finished" });
      for (const row of result.end.results) expect(row.measures).toEqual(computeMeasures(row.counters, row.elapsed));
    }
  });

  it("replays exactly without mutating the input, and changes with the seed", () => {
    const setup = input();
    const saved = JSON.stringify(setup);
    const first = simulateRace(setup);
    expect(simulateRace(setup)).toEqual(first);
    expect(JSON.stringify(setup)).toBe(saved);
    expect(simulateRace({ ...setup, bots: [{ ...setup.bots[0]!, seed: [4, 3, 2, 1] }] })).not.toEqual(first);
  });

  it("uses registration order for tied bots regardless of configuration ordering", () => {
    const setup = input();
    const second = { ...setup.bots[0]!, entrantId: asEntrantId("second") };
    const race = { ...setup.race, participants: [...setup.race.participants, { entrantId: second.entrantId, kind: "bot" as const }] };
    expect(simulateRace({ ...setup, race, bots: [setup.bots[0]!, second] })).toEqual(simulateRace({ ...setup, race, bots: [second, setup.bots[0]!] }));
  });

  it("records real timeouts at the configured deadline without fabricating a finish", () => {
    const setup = input();
    const result = simulateRace({ ...setup, humanEvents: [], race: { ...setup.race, text: "long passage ".repeat(200), timeLimit: asDuration(30_000) } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.end.endedAt).toBe(33_000);
    expect(result.race.entrants.map((entrant) => entrant.status)).toEqual(["timedOut", "timedOut"]);
  });

  it("applies scripted human typing without assigning it a bot identity", () => {
    const setup = input();
    const result = simulateRace({ ...setup, race: { ...setup.race, text: "a" }, humanEvents: [{ type: "keystrokes", now: asInstant(4000),
      batch: { raceId: RACE, entrantId: HUMAN, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "a" }] } }] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.race.entrants[0]).toMatchObject({ kind: "human", status: "finished", ackSeq: 1 });
  });

  it("lets the reducer abandon an unscripted human for inactivity", () => {
    const result = simulateRace({ ...input(), humanEvents: [] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.race.entrants[0]).toMatchObject({ status: "abandoned", abandonReason: "inactivity" });
  });


  it("scales to thirty entrants and preserves input-order-independent bot configuration", () => {
    const setup = input();
    const bots = Array.from({ length: 29 }, (_, index) => ({ ...setup.bots[0]!, entrantId: asEntrantId(`bot-${index}`) }));
    const result = simulateRace({ ...setup, bots, race: { ...setup.race, text: "abc", participants: [
      { entrantId: HUMAN, kind: "human" }, ...bots.map(({ entrantId }) => ({ entrantId, kind: "bot" as const })),
    ] } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.end.results).toHaveLength(30);
    expect(result.end.results.filter((row) => row.status === "finished")).toHaveLength(29);
    expect(new Set(result.end.results.map((row) => row.rank)).size).toBe(30);
  });

  it("lets a deadline win over a human keystroke at that exact instant", () => {
    const setup = input();
    const result = simulateRace({ ...setup, race: { ...setup.race, text: "a", timeLimit: asDuration(30_000) }, humanEvents: [
      { type: "keystrokes", now: asInstant(33_000), batch: { raceId: RACE, entrantId: HUMAN, seq: 1, textVersion: 0,
        events: [{ type: "insert", grapheme: "a" }] } },
    ] });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.reason);
    expect(result.race.entrants[0]).toMatchObject({ status: "timedOut", ackSeq: 0 });
  });

  it("refuses missing, duplicate, foreign and invalid bot configurations", () => {
    const setup = input();
    for (const bots of [[], [setup.bots[0]!, setup.bots[0]!], [{ ...setup.bots[0]!, entrantId: HUMAN }], [{ ...setup.bots[0]!, seed: [0, 0, 0, 0] as const }]]) {
      expect(simulateRace({ ...setup, bots })).toEqual({ ok: false, reason: "INVALID_BOTS" });
    }
  });

  it("refuses out-of-order script times and scripts impersonating bots", () => {
    expect(simulateRace({ ...input(), humanEvents: [
      { type: "present", entrantId: HUMAN, now: asInstant(4000) }, { type: "abandon", entrantId: HUMAN, now: asInstant(3000) },
    ] })).toEqual({ ok: false, reason: "INVALID_SCRIPT" });
    expect(simulateRace({ ...input(), humanEvents: [{ type: "abandon", entrantId: BOT, now: asInstant(3000) }] })).toEqual({ ok: false, reason: "INVALID_SCRIPT" });
  });

  it("stops on a refused human batch rather than fabricating progress", () => {
    expect(simulateRace({ ...input(), humanEvents: [{ type: "keystrokes", now: asInstant(3000), batch: {
      raceId: RACE, entrantId: HUMAN, seq: 2, textVersion: 0, events: [{ type: "insert", grapheme: "L" }],
    } }] })).toEqual({ ok: false, reason: "EVENT_REFUSED" });
  });

  it("bounds both scheduling work and virtual duration", () => {
    expect(simulateRace({ ...input(), maxSteps: 1 })).toEqual({ ok: false, reason: "STEP_LIMIT" });
    expect(simulateRace({ ...input(), maxDurationMs: 1000 })).toEqual({ ok: false, reason: "TIME_LIMIT" });
    for (const maxSteps of [0, NaN, 1.5, 1_000_001]) expect(simulateRace({ ...input(), maxSteps })).toEqual({ ok: false, reason: "INVALID_LIMITS" });
    const setup = input();
    expect(simulateRace({ ...setup, race: { ...setup.race, participants: [setup.race.participants[1]!] } })).toEqual({ ok: false, reason: "INVALID_RACE" });
  });
});
