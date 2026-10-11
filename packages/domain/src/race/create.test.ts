import { describe, expect, it } from "vitest";
import { asEntrantId, asRaceId, type EntrantId, type RaceId } from "../ids";
import { asDuration, asInstant, MAX_INSTANT, type Duration, type Instant } from "../time";
import { createRace, createRaceRefusal } from "./create";
import { COUNTDOWN_MS, MAX_TEXT_GRAPHEMES, TIME_LIMIT_MAX_MS, TIME_LIMIT_MIN_MS } from "./limits";
import type { EntrantKind } from "./start";
import type { CreateRaceInput, CreateRaceRefusal, ErrorMode } from "./types";

const RACE = asRaceId("race-1");
const NOW = asInstant(997_000);
const human = (id: string): CreateRaceInput["participants"][number] => ({ entrantId: asEntrantId(id), kind: "human" });
const bot = (id: string): CreateRaceInput["participants"][number] => ({ entrantId: asEntrantId(id), kind: "bot" });

function input(overrides: Partial<CreateRaceInput> = {}): CreateRaceInput {
  return { raceId: RACE, text: "ab", errorMode: "mandatory", timeLimit: null, participants: [human("alice"), human("bob")], now: NOW, ...overrides };
}

/** The refusal `createRace` gives, or undefined when it accepts. */
function refusalOf(candidate: CreateRaceInput): CreateRaceRefusal | undefined {
  const result = createRace(candidate);
  return result.ok ? undefined : result.reason;
}

/** Deeply frozen, so any mutation of an input throws. */
function frozen<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) {
      frozen((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

describe("createRace (F-04.1)", () => {
  it("starts an accepted race in countdown, revision 0, with every entrant ready to type", () => {
    expect(createRace(frozen(input({ text: "é b", timeLimit: asDuration(30_000), participants: [human("alice"), bot("bot-1")] })))).toEqual({
      ok: true,
      race: {
        raceId: RACE,
        revision: 0,
        phase: "countdown",
        errorMode: "mandatory",
        timeLimit: 30_000,
        countdownAt: NOW,
        startsAt: NOW + COUNTDOWN_MS,
        clock: NOW,
        text: ["é", " ", "b"],
        entrants: [
          { entrantId: "alice", kind: "human", target: ["é", " ", "b"], textVersion: 0, typed: [], pendingError: false, counters: { correctInserts: 0, totalInserts: 0 }, missedKeys: {}, ackSeq: 0, status: "racing" },
          { entrantId: "bot-1", kind: "bot", target: ["é", " ", "b"], textVersion: 0, typed: [], pendingError: false, counters: { correctInserts: 0, totalInserts: 0 }, missedKeys: {}, ackSeq: 0, status: "racing" },
        ],
      },
    });
  });

  it("keeps the registration order of the participants", () => {
    const result = createRace(input({ participants: [human("zed"), human("amy"), bot("mid")] }));
    expect(result.ok && result.race.entrants.map((entrant) => entrant.entrantId)).toEqual(["zed", "amy", "mid"]);
  });

  it("stores the text as NFC graphemes, a decomposed accent counting once", () => {
    const result = createRace(input({ text: "été" }));
    expect(result.ok && result.race.text).toEqual(["é", "t", "é"]);
  });

  it.each([
    ["one participant", { participants: [human("alice")] }, "NOT_ENOUGH_PARTICIPANTS"],
    ["no participant", { participants: [] }, "NOT_ENOUGH_PARTICIPANTS"],
    ["two bots", { participants: [bot("b1"), bot("b2")] }, "NO_HUMAN_PARTICIPANT"],
    ["the same entrant twice", { participants: [human("alice"), human("alice")] }, "DUPLICATE_ENTRANT"],
    ["an entrant registered as a human and as a bot", { participants: [human("alice"), bot("alice")] }, "DUPLICATE_ENTRANT"],
    ["an empty text", { text: "" }, "EMPTY_TEXT"],
    ["a text one grapheme too long", { text: "a".repeat(MAX_TEXT_GRAPHEMES + 1) }, "TEXT_TOO_LONG"],
    ["a decomposed text one grapheme too long", { text: "é".repeat(MAX_TEXT_GRAPHEMES + 1) }, "TEXT_TOO_LONG"],
    ["a time limit 1 ms too short", { timeLimit: (TIME_LIMIT_MIN_MS - 1) as Duration }, "INVALID_TIME_LIMIT"],
    ["a time limit 1 ms too long", { timeLimit: (TIME_LIMIT_MAX_MS + 1) as Duration }, "INVALID_TIME_LIMIT"],
    ["a fractional time limit", { timeLimit: 30_000.5 as Duration }, "INVALID_TIME_LIMIT"],
    ["a time limit that is NaN", { timeLimit: Number.NaN as Duration }, "INVALID_TIME_LIMIT"],
    ["a negative time limit", { timeLimit: -30_000 as Duration }, "INVALID_TIME_LIMIT"],
    ["an infinite time limit", { timeLimit: Number.POSITIVE_INFINITY as Duration }, "INVALID_TIME_LIMIT"],
  ] as const)("refuses %s", (_label, overrides, reason) => {
    const candidate = frozen(input(overrides as Partial<CreateRaceInput>));
    expect(createRaceRefusal(candidate)).toBe(reason);
    expect(createRace(candidate)).toEqual({ ok: false, reason });
  });

  it.each([
    ["one human and one bot", { participants: [human("alice"), bot("bot-1")] }],
    ["a one-grapheme text", { text: "a" }],
    ["a text of exactly MAX_TEXT_GRAPHEMES graphemes", { text: "a".repeat(MAX_TEXT_GRAPHEMES) }],
    ["a decomposed text of exactly MAX_TEXT_GRAPHEMES graphemes, twice as many code units", { text: "é".repeat(MAX_TEXT_GRAPHEMES) }],
    ["the shortest time limit", { timeLimit: asDuration(TIME_LIMIT_MIN_MS) }],
    ["the longest time limit", { timeLimit: asDuration(TIME_LIMIT_MAX_MS) }],
    ["no time limit at all (D-17)", { timeLimit: null }],
  ] as const)("accepts %s", (_label, overrides) => {
    const candidate = input(overrides as Partial<CreateRaceInput>);
    expect(createRaceRefusal(candidate)).toBeUndefined();
    expect(createRace(candidate).ok).toBe(true);
  });

  it.each([
    ["the start rule before a duplicate", { participants: [human("alice")], text: "" }, "NOT_ENOUGH_PARTICIPANTS"],
    ["the start rule before everything else", { participants: [bot("b"), bot("b")], text: "", timeLimit: 1 as Duration }, "NO_HUMAN_PARTICIPANT"],
    ["a duplicate before an empty text", { participants: [human("a"), human("a")], text: "" }, "DUPLICATE_ENTRANT"],
    ["a duplicate before an invalid time limit", { participants: [human("a"), human("a")], timeLimit: 1 as Duration }, "DUPLICATE_ENTRANT"],
    ["an empty text before an invalid time limit", { text: "", timeLimit: 1 as Duration }, "EMPTY_TEXT"],
    ["a text too long before an invalid time limit", { text: "a".repeat(MAX_TEXT_GRAPHEMES + 1), timeLimit: 1 as Duration }, "TEXT_TOO_LONG"],
  ] as const)("checks %s", (_label, overrides, reason) => {
    const candidate = input(overrides as Partial<CreateRaceInput>);
    expect(createRaceRefusal(candidate)).toBe(reason);
    expect(refusalOf(candidate)).toBe(reason);
  });

  it("reads only the participants, the text and the time limit before the start", () => {
    expect(createRaceRefusal({ participants: [human("alice"), human("bob")], text: "ab", timeLimit: null })).toBeUndefined();
    expect(createRaceRefusal({ participants: [human("alice"), human("bob")], text: "", timeLimit: null })).toBe("EMPTY_TEXT");
  });

  it("agrees with createRace on every combination of parameters", () => {
    const participantSets = [[], [human("a")], [bot("a"), bot("b")], [human("a"), human("a")], [human("a"), bot("b")], [human("a"), human("b"), bot("c")]];
    const texts = ["", "a", "é", "a".repeat(MAX_TEXT_GRAPHEMES), "a".repeat(MAX_TEXT_GRAPHEMES + 1)];
    const limits = [null, TIME_LIMIT_MIN_MS - 1, TIME_LIMIT_MIN_MS, 45_000, TIME_LIMIT_MAX_MS, TIME_LIMIT_MAX_MS + 1, 0.5, Number.NaN];
    let accepted = 0;
    for (const participants of participantSets) {
      for (const text of texts) {
        for (const timeLimit of limits) {
          const candidate = input({ participants, text, timeLimit: timeLimit as Duration | null });
          const reason = createRaceRefusal(candidate);
          expect(refusalOf(candidate)).toBe(reason);
          accepted += reason === undefined ? 1 : 0;
        }
      }
    }
    // 2 valid participant sets × 3 valid texts × 4 valid limits.
    expect(accepted).toBe(24);
  });

  it.each([
    ["an invalid race id", { raceId: "" as RaceId }],
    ["an invalid entrant id", { participants: [human("alice"), { entrantId: "bob smith" as EntrantId, kind: "human" as const }] }],
    ["an unknown kind", { participants: [human("alice"), { entrantId: asEntrantId("bob"), kind: "spectator" as EntrantKind }] }],
    ["an unknown error mode", { errorMode: "lenient" as ErrorMode }],
    ["a fractional now", { now: 997_000.5 as Instant }],
    ["a negative now", { now: -1 as Instant }],
    ["a now whose start passes MAX_INSTANT", { now: asInstant(MAX_INSTANT - COUNTDOWN_MS + 1) }],
    ["a now whose time-limit deadline passes MAX_INSTANT", { now: asInstant(MAX_INSTANT - COUNTDOWN_MS - TIME_LIMIT_MIN_MS + 1), timeLimit: asDuration(TIME_LIMIT_MIN_MS) }],
  ] as const)("throws a RangeError for %s, a programming error", (_label, overrides) => {
    expect(() => createRace(input(overrides as Partial<CreateRaceInput>))).toThrow(RangeError);
  });

  it.each([["a line feed", "ab\ncd"], ["a carriage return", "ab\rcd"], ["a CRLF", "ab\r\ncd"]])("throws a RangeError for a text holding %s: a race text never does (D-16)", (_label, text) => {
    expect(createRaceRefusal(input({ text }))).toBeUndefined();
    expect(() => createRace(input({ text }))).toThrow(RangeError);
  });

  it("still gives the refusals first for a text holding a line break", () => {
    expect(createRace(input({ text: "\n", participants: [human("alice")] }))).toEqual({ ok: false, reason: "NOT_ENOUGH_PARTICIPANTS" });
  });

  it("accepts the latest now whose deadline is MAX_INSTANT exactly", () => {
    const result = createRace(input({ now: asInstant(MAX_INSTANT - COUNTDOWN_MS - TIME_LIMIT_MIN_MS), timeLimit: asDuration(TIME_LIMIT_MIN_MS) }));
    expect(result.ok && result.race.startsAt + TIME_LIMIT_MIN_MS).toBe(MAX_INSTANT);
  });

  it("refuses invalid parameters before checking the server's own values", () => {
    expect(createRace(input({ raceId: "" as RaceId, text: "" }))).toEqual({ ok: false, reason: "EMPTY_TEXT" });
  });
});
