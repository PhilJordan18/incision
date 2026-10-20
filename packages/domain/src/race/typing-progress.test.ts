import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId } from "../ids";
import { asInstant } from "../time";
import { createRace } from "./create";
import { reduceRace } from "./reduce";
import type { ErrorMode, InputEvent, RaceState } from "./types";

const actor = asEntrantId("actor");
function race(errorMode: ErrorMode = "mandatory"): RaceState {
  const result = createRace({ raceId: asRaceId("race"), now: asInstant(0), text: "abc def ghi jkl", errorMode, timeLimit: null,
    participants: [{ entrantId: actor, kind: "human" }, { entrantId: asEntrantId("other"), kind: "human" }] });
  if (!result.ok) throw new Error(result.reason);
  return reduceRace(result.race, { type: "tick", now: asInstant(3000) }).state;
}
const insert = (grapheme: string): InputEvent => ({ type: "insert", grapheme });
function type(state: RaceState, events: readonly InputEvent[], seq = 1, textVersion = 0) {
  return reduceRace(state, { type: "keystrokes", now: asInstant(4000), batch: {
    raceId: state.raceId, entrantId: actor, seq, textVersion, events,
  } });
}

describe("private applied typing high-water observation", () => {
  it.each(["free", "mandatory"] as const)("retains intermediate progress after backspace in %s", (mode) => {
    const output = type(race(mode), [insert("a"), insert("b"), { type: "deleteBackward" }]);
    expect(output.state.entrants[0]!.typed).toEqual(["a"]);
    expect(output.typingProgress).toEqual({ entrantId: actor, furthestPosition: 2 });
    expect(output.keystrokes).not.toHaveProperty("furthestPosition");
  });
  it("does not count mandatory errors as inserted positions", () => {
    expect(type(race(), [insert("x")]).typingProgress?.furthestPosition).toBe(0);
    expect(type(race("free"), [insert("x")]).typingProgress?.furthestPosition).toBe(1);
  });
  it("does not leak speculative progress from refused, resync or duplicate batches", () => {
    const initial = race();
    expect(type(initial, [insert("ab")]).typingProgress).toBeUndefined();
    expect(type(initial, [insert("a")], 2).typingProgress).toBeUndefined();
    expect(type(initial, [insert("a")], 1, 1).typingProgress).toBeUndefined();
    const applied = type(initial, [insert("a")]);
    expect(type(applied.state, [insert("a")]).typingProgress).toBeUndefined();
    const implausible = reduceRace(race("free"), { type: "keystrokes", now: asInstant(3000), batch: {
      raceId: initial.raceId, entrantId: actor, seq: 1, textVersion: 0,
      events: Array.from({ length: 21 }, () => [insert("x"), { type: "deleteBackward" } as const]).flat(),
    } });
    expect(implausible.keystrokes).toMatchObject({ reason: "IMPLAUSIBLE" });
    expect(implausible.typingProgress).toBeUndefined();
  });
  it("stops observing at the finishing insert", () => {
    const initial = race();
    const output = type(initial, [...initial.text.map(insert), { type: "deleteBackward" }, insert("z")]);
    expect(output.state.entrants[0]!.status).toBe("finished");
    expect(output.typingProgress?.furthestPosition).toBe(initial.text.length);
  });
});
