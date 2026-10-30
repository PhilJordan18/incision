import { DEFAULT_TEXT_SETTINGS, type Interruption, type OwnRoomSettings, type RaceToCreate, type RoomSettings, type StartRaceInput, type StartRaceResult, type Transition } from "@incision/database";
import { asRandomState, COUNTDOWN_MS, type CreateRaceRefusal, MAX_BATCHES_PER_SECOND, type RaceState, type BonusRaceState, RESUME_GRACE_MS } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import { RACE_PROGRESS_EVENT, RACE_REVEAL_EVENT, RACE_SELF_EVENT, type RaceProgressPayload, type RaceRevealPayload, type RaceSelfPayload } from "../../races/protocol";
import { CONTROL_WINDOW, ENTRANT_ACTION_WINDOW, RaceService, type RoomConnection, START_WINDOW } from "./race-service";
import { CorpusTexts, FIXTURE_RACE_TEXTS, fixedRaceTexts, type RaceTextDraw, type RaceTextSource } from "./race-texts";

const START = 1_800_000_000_000;
const LOBBY = "lobby-1";
const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
/** An existing room keeps its saved 120 s limit after the D-19 default changes. */
const INITIAL_SETTINGS: RoomSettings = { revision: 0, textLanguage: "fr", wordCount: 50, timeLimitMs: 120_000, errorMode: "mandatory", ...DEFAULT_TEXT_SETTINGS };
const PARTICIPANTS = [
  { entrantId: "e-host", accountId: "a-host", memberId: "m-host", ordinal: 1, displayName: "Hôte" },
  { entrantId: "e-bea", accountId: "a-bea", memberId: "m-bea", ordinal: 2, displayName: "Bea" },
];

function harness(
  options: {
    refusal?: "NOT_HOST" | "NOT_ENOUGH_PARTICIPANTS";
    participants?: typeof PARTICIPANTS;
    renewed?: boolean;
    texts?: RaceTextSource;
    racesOpen?: boolean;
    /** The room's stored settings, over INITIAL_SETTINGS. */
    settings?: Partial<RoomSettings>;
    /** The room as read before the draw; `a-host` hosts it and every `a-…` account is in it by default. */
    room?: Partial<Pick<OwnRoomSettings, "phase" | "isHost">> | "none";
    /** How many starts the room lock refuses because settings were saved since the read before the draw. */
    settingsChanges?: number;
    /** What those saves changed, read with the next draw. */
    saved?: Partial<RoomSettings>;
  } = {},
) {
  let now = START;
  const timers: { at: number; callback: () => void }[] = [];
  const created: RaceState[] = [];
  let changes = 0;
  const readOwnRoomSettings = vi.fn(async (accountId: string): Promise<OwnRoomSettings | undefined> => {
    if (options.room === "none") {
      return undefined;
    }
    const settings = { ...INITIAL_SETTINGS, ...options.settings, ...(changes > 0 ? options.saved : {}) };
    return {
      lobbyId: LOBBY,
      phase: "waiting",
      isHost: accountId === "a-host",
      ...options.room,
      // Each save the room lock reported is in the next read.
      settings: { ...settings, revision: settings.revision + changes },
    };
  });
  const startRace = vi.fn(async (input: StartRaceInput<CreateRaceRefusal, BonusRaceState>): Promise<StartRaceResult<CreateRaceRefusal, BonusRaceState>> => {
    if (changes < (options.settingsChanges ?? 0)) {
      changes += 1;
      return { ok: false, error: "SETTINGS_CHANGED" };
    }
    if (options.refusal !== undefined) {
      return { ok: false, error: options.refusal };
    }
    const entrants = options.participants ?? PARTICIPANTS;
    const toCreate: RaceToCreate = { raceId: RACE, entrants: entrants.map(({ entrantId }) => ({ entrantId, kind: "human" as const })) };
    const result = input.create(toCreate);
    if (!result.ok) {
      return { ok: false, error: result.reason };
    }
    created.push(result.race.race);
    return {
      ok: true,
      race: { raceId: RACE, lobbyId: LOBBY, ownerId: "owner-a", ownerEpoch: 1, roundNo: 1, countdownAt: new Date(START), leaseExpiresAt: new Date(START + 30_000) },
      entrants,
      created: result.race,
      ...(input.accountId === null ? { guestSession: { id: input.guestProof.id, expiresAt: new Date(START + 86_400_000) } } : {}),
    };
  });
  const store = {
    startRace,
    readOwnRoomSettings,
    readGuestRoomSettings: vi.fn(async () => readOwnRoomSettings("a-host")),
    beginRacing: vi.fn(async (): Promise<Transition> => ({ won: true, alreadyDone: false })),
    finalizeRace: vi.fn(async (): Promise<Transition> => ({ won: true, alreadyDone: false })),
    interruptOwnRace: vi.fn(async (): Promise<Interruption> => ({ won: true, alreadyDone: false })),
    renewRaceLease: vi.fn(async () => ({ renewed: options.renewed ?? true })),
  };
  const changed: string[] = [];
  const lost: string[] = [];
  const logged: string[] = [];
  const service = new RaceService({
    ownerId: "owner-a",
    store,
    now: () => now,
    monotonic: () => now,
    schedule: (callback, delayMs) => {
      const timer = { at: now + delayMs, callback };
      timers.push(timer);
      return () => void timers.splice(timers.indexOf(timer), 1);
    },
    onRoomChanged: (lobbyId) => changed.push(lobbyId),
    onRaceLost: (lobbyId) => lost.push(lobbyId),
    texts: options.texts ?? fixedRaceTexts(FIXTURE_RACE_TEXTS),
    racesOpen: options.racesOpen ?? true,
    log: () => undefined,
    logError: (message) => logged.push(message),
  });
  const advance = (ms: number) => {
    const target = now + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (due === undefined || due.at > target) {
        break;
      }
      timers.shift();
      now = due.at;
      due.callback();
    }
    now = target;
  };
  return { service, store, created, changed, lost, logged, advance };
}

function tab(id: string, accountId: string) {
  const received: { event: string; payload: unknown }[] = [];
  const connection: RoomConnection = { id, accountId, emit: (event, payload) => void received.push({ event, payload }) };
  return { connection, received, reveal: () => received.find((message) => message.event === RACE_REVEAL_EVENT)?.payload as RaceRevealPayload | undefined };
}

// Written for these tests, not corpus passages: about sixty words each, normalised.
const CORPUS_FR = {
  id: "fr-test-depart",
  language: "fr" as const,
  complexity: "medium" as const,
  text: "La mer est calme ce matin. Le capitaine regarde le ciel, puis il appelle son équipage. Nous levons l'ancre avant midi, et le navire quitte le port sous un vent léger. Les mouettes crient au-dessus des vagues. Vers le soir, la côte disparaît derrière nous, et chacun reprend son poste en silence. La nuit sera longue, mais personne ne se plaint.",
};
const CORPUS_EN = {
  id: "en-test-departure",
  language: "en" as const,
  complexity: "medium" as const,
  text: "The sea was calm that morning. The captain looked at the sky, then called his crew on deck. We raised the anchor before noon, and the ship left the harbour under a light wind. Gulls cried above the waves. Towards evening the coast faded behind us, and each sailor went back to his post in silence. The night would be long, but nobody complained.",
};

const batch = (seq: number, grapheme: string) => ({ raceId: RACE, seq, textVersion: 0, events: [{ type: "insert", grapheme }] });

describe("RaceService", () => {
  it("bounds activation across tabs and reconnects, and validates identity and payload", async () => {
    const { service, advance } = harness();
    const first = tab("first", "a-host").connection;
    const second = tab("second", "a-host").connection;
    service.follow(LOBBY, first);
    service.follow(LOBBY, second);
    await service.start(first, {});
    advance(COUNTDOWN_MS);
    const payload = { raceId: RACE, seq: 1, milestone: 25 };
    expect(service.activateBonus({ ...first, accountId: "a-bea" }, payload)).toEqual({ ok: false, error: "NO_RACE" });
    expect(service.activateBonus(first, { ...payload, entrantId: "e-bea" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(service.activateBonus(second, payload)).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    for (let n = 0; n < 3; n++) expect(service.activateBonus(first, payload)).toMatchObject({ ok: true, result: { reason: "BONUSES_DISABLED" } });
    service.unfollow(first.id);
    service.unfollow(second.id);
    service.follow(LOBBY, first);
    expect(service.activateBonus(first, payload)).toEqual({ ok: false, error: "RATE_LIMITED" });
    advance(1000);
    expect(service.activateBonus(first, payload)).toMatchObject({ ok: true, result: { reason: "BONUSES_DISABLED" } });
  });
  it("has the engine create the race with the room's settings, whatever the host's pages, and runs it here", async () => {
    const { service, store, created, changed } = harness({ settings: { revision: 4, textLanguage: "en", wordCount: 50, timeLimitMs: 90_000 } });
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: true });
    const input = store.startRace.mock.calls[0]?.[0];
    expect(input).toMatchObject({ accountId: "a-host", ownerId: "owner-a", text: FIXTURE_RACE_TEXTS.en.text, lobbyId: LOBBY, settingsRevision: 4, rulesVersion: 1 });
    expect(input?.config).toEqual({ errorMode: "mandatory", timeLimitMs: 90_000, wordCount: 50, language: "en", text: "fixture", bonuses: false });
    expect(created[0]).toMatchObject({ phase: "countdown", errorMode: "mandatory", timeLimit: 90_000, startsAt: START + COUNTDOWN_MS });
    expect(service.ownsRace(LOBBY)).toBe(true);
    expect(changed).toEqual([LOBBY]);
    // The text reaches the room's tabs only now, never before the countdown (COURSE-03).
    expect(bea.reveal()?.reveal.text.join("")).toBe(FIXTURE_RACE_TEXTS.en.text);
    expect(bea.reveal()?.selfEntrantId).toBe("e-bea");
  });

  it.each([null, 30_000, 121_000, 600_000])("freezes the actual duration %s at start, without substituting a ceiling", async (timeLimitMs) => {
    const { service, store, created } = harness({ settings: { timeLimitMs } });
    const host = tab("t-host", "a-host");
    service.follow(LOBBY, host.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: true });
    expect(store.startRace.mock.calls[0]?.[0].config["timeLimitMs"]).toBe(timeLimitMs);
    expect(created[0]?.timeLimit).toBe(timeLimitMs);
  });

  it.each([null, 30_000, 600_000])("runs free typing with duration %s and keeps corrected mistakes in the counters", async (timeLimitMs) => {
    const { service, store, created, advance } = harness({ settings: { errorMode: "free", timeLimitMs } });
    const host = tab("free-host", "a-host");
    const observer = tab("free-observer", "a-host");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, observer.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: true });
    expect(store.startRace.mock.calls[0]?.[0].config).toMatchObject({ errorMode: "free", timeLimitMs });
    expect(created[0]).toMatchObject({ errorMode: "free", timeLimit: timeLimitMs });
    expect(host.reveal()?.reveal.errorMode).toBe("free");
    advance(COUNTDOWN_MS + 1000);
    const target = host.reveal()!.reveal.text;
    const wrong = target[0] === "x" ? "y" : "x";
    const snapshot = () => (observer.received.filter(({ event }) => event === RACE_SELF_EVENT).at(-1)?.payload as RaceSelfPayload).snapshot;
    expect(service.keystrokes(host.connection, batch(1, wrong))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    expect(snapshot()).toMatchObject({ typed: [wrong], pendingError: false, counters: { totalInserts: 1, correctInserts: 0 } });
    advance(100);
    expect(service.keystrokes(host.connection, batch(2, target[1]!))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    expect(snapshot()).toMatchObject({ typed: [wrong, target[1]], counters: { totalInserts: 2, correctInserts: 1 } });
    advance(100);
    expect(service.keystrokes(host.connection, { ...batch(3, wrong), events: [{ type: "deleteBackward" }, { type: "deleteBackward" }] })).toMatchObject({ ok: true });
    expect(snapshot()).toMatchObject({ typed: [], counters: { totalInserts: 2, correctInserts: 1 } });
    advance(100);
    expect(service.keystrokes(host.connection, batch(4, target[0]!))).toMatchObject({ ok: true });
    expect(snapshot()).toMatchObject({ typed: [target[0]], counters: { totalInserts: 3, correctInserts: 2 } });
  });

  it("runs the texts it is given, never the fixtures in their place, and records which one", async () => {
    const texts = { fr: { id: "fr-injected", text: "Texte injecté pour ce test." }, en: { id: "en-injected", text: "Text injected for this test." } };
    const { service, store } = harness({ texts: fixedRaceTexts(texts) });
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: true });
    expect(store.startRace.mock.calls[0]?.[0]).toMatchObject({ text: texts.fr.text, config: { language: "fr", text: "fr-injected" } });
    expect(bea.reveal()?.reveal.text.join("")).toBe(texts.fr.text);
  });

  it("draws a corpus passage in the room's text language, records its provenance, and reveals only the cut", async () => {
    const corpus = { version: "test-1", passages: Object.freeze([CORPUS_FR, CORPUS_EN].map((passage) => Object.freeze(passage))) };
    const texts = new CorpusTexts({ load: async () => corpus, seed: () => asRandomState([1, 2, 3, 4]), log: () => undefined, logError: () => undefined });
    const { service, store } = harness({ texts });
    // The room's texts are French (its initial settings), whatever language anyone's pages use.
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: true });
    const cut = CORPUS_FR.text.split(" ").slice(0, 50).join(" ");
    const input = store.startRace.mock.calls[0]?.[0];
    expect(input?.text).toBe(cut);
    expect(input?.config).toEqual({
      wordCount: 50,
      errorMode: "mandatory",
      timeLimitMs: 120_000,
      language: "fr",
      text: CORPUS_FR.id,
      corpusVersion: "test-1",
      textSettings: { kind: "coherent", language: "fr", wordCount: 50, complexity: "medium", options: { punctuation: true, numbers: false, capitals: true, accents: true } },
      textVersions: { generator: 1, criteria: "start-1", normalization: 2, prng: expect.any(String) },
      bonuses: false,
    });
    expect(bea.reveal()?.reveal.text.join("")).toBe(cut);
    expect(bea.reveal()?.language).toBe("fr");
  });

  it("refuses a start before the database when no corpus is active, no passage fits the settings, or the corpus cannot load, and writes no race", async () => {
    for (const [load, error] of [
      // Distinct refusals: no texts at all, texts but none for these settings, a technical failure.
      [async () => undefined, "TEXTS_UNAVAILABLE"],
      [async () => ({ version: "test-1", passages: Object.freeze([Object.freeze(CORPUS_EN)]) }), "NO_COMPATIBLE_PASSAGE"],
      [
        async () => {
          throw new Error("connect ECONNREFUSED");
        },
        "UNAVAILABLE",
      ],
    ] as const) {
      const texts = new CorpusTexts({ load, log: () => undefined, logError: () => undefined });
      const { service, store, changed } = harness({ texts });
      const host = tab("t-host", "a-host");
      service.follow(LOBBY, host.connection);
      service.follow(LOBBY, tab("t-bea", "a-bea").connection);
      expect(await service.start(host.connection, {})).toEqual({ ok: false, error });
      expect(store.startRace).not.toHaveBeenCalled();
      expect(service.ownsRace(LOBBY)).toBe(false);
      expect(changed).toEqual([]);
    }
  });

  it("draws a text only for a start that may go on: never while races are closed, beyond the start window, or during the same account's start", async () => {
    const draw = vi.fn(async (): Promise<RaceTextDraw> => ({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" }));
    const closed = harness({ racesOpen: false, texts: { draw } });
    expect(await closed.service.start(tab("t-host", "a-host").connection, {})).toEqual({ ok: false, error: "RACES_CLOSED" });
    expect(draw).not.toHaveBeenCalled();

    const { service } = harness({ texts: { draw } });
    const host = tab("t-host", "a-host").connection;
    for (let attempt = 0; attempt < START_WINDOW.maxStarts; attempt += 1) {
      expect(await service.start(host, {})).toEqual({ ok: false, error: "NO_COMPATIBLE_PASSAGE" });
    }
    expect(await service.start(host, {})).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(draw).toHaveBeenCalledTimes(START_WINDOW.maxStarts);

    draw.mockClear();
    const pending = Promise.withResolvers<RaceTextDraw>();
    draw.mockReturnValueOnce(pending.promise);
    const other = harness({ texts: { draw } }).service;
    const first = other.start(tab("t-1", "a-host").connection, {});
    expect(await other.start(tab("t-2", "a-host").connection, {})).toEqual({ ok: false, error: "RATE_LIMITED" });
    pending.resolve({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" });
    expect(await first).toEqual({ ok: false, error: "NO_COMPATIBLE_PASSAGE" });
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("writes no race when the process began stopping while the text was drawn", async () => {
    const pending = Promise.withResolvers<RaceTextDraw>();
    const { service, store } = harness({ texts: { draw: () => pending.promise } });
    const host = tab("t-host", "a-host");
    service.follow(LOBBY, host.connection);
    const start = service.start(host.connection, {});
    await service.stop({ onEnded: () => undefined, timeoutMs: 1_000 });
    pending.resolve({ ok: true, text: FIXTURE_RACE_TEXTS.fr.text, record: { language: "fr", text: "fixture" } });
    expect(await start).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(store.startRace).not.toHaveBeenCalled();
  });

  it("refuses every start before the database while races are closed (RACES_ENABLED), and leaves the room as it was", async () => {
    const { service, store, changed } = harness({ racesOpen: false });
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    // The host's button, a repeat, or a direct call (the next round's start too): one path, refused,
    // and before the start window, which a closed refusal never fills.
    for (let attempt = 0; attempt <= START_WINDOW.maxStarts; attempt += 1) {
      expect(await service.start(host.connection, {})).toEqual({ ok: false, error: "RACES_CLOSED" });
    }
    expect(store.startRace).not.toHaveBeenCalled();
    expect(service.ownsRace(LOBBY)).toBe(false);
    expect(changed).toEqual([]);
    expect(bea.reveal()).toBeUndefined();
  });

  it("marks the race text with the room's text language for every reader", async () => {
    const { service } = harness({ settings: { textLanguage: "en" } });
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    await service.start(host.connection, {});
    expect(bea.reveal()?.language).toBe("en");
    expect(host.reveal()?.language).toBe("en");
  });

  it("passes the database's and the engine's refusals on, and runs nothing", async () => {
    // The host changed between the read before the draw and the room lock.
    const notHost = harness({ refusal: "NOT_HOST" });
    expect(await notHost.service.start(tab("t", "a-host").connection, {})).toEqual({ ok: false, error: "NOT_HOST" });
    // The engine's own start rule, applied under the room lock (COURSE-02).
    const alone = harness({ participants: PARTICIPANTS.slice(0, 1) });
    expect(await alone.service.start(tab("t", "a-host").connection, {})).toEqual({ ok: false, error: "NOT_ENOUGH_PARTICIPANTS" });
    expect(alone.service.ownsRace(LOBBY)).toBe(false);
    expect(await alone.service.start(tab("t", "a-host").connection, { text: "mine" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
  });

  it("refuses before the draw a start that cannot go on: outside a room, by a guest, or once the room left WAITING", async () => {
    for (const [options, accountId, error] of [
      [{ room: "none" }, "a-host", "NOT_IN_A_ROOM"],
      [{}, "a-bea", "NOT_HOST"],
      [{ room: { phase: "countdown" } }, "a-host", "ROOM_NOT_WAITING"],
    ] as const) {
      const draw = vi.fn(async (): Promise<RaceTextDraw> => ({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" }));
      const { service, store } = harness({ ...options, texts: { draw } });
      expect(await service.start(tab("t", accountId).connection, {})).toEqual({ ok: false, error });
      expect(draw).not.toHaveBeenCalled();
      expect(store.startRace).not.toHaveBeenCalled();
    }
  });

  it("refuses invalid limits without drawing", async () => {
    for (const settings of [{ timeLimitMs: 29_999 }, { timeLimitMs: 600_001 }] as const) {
      const draw = vi.fn(async (): Promise<RaceTextDraw> => ({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" }));
      const logged: string[] = [];
      const base = harness({ settings, texts: { draw } });
      const service = new RaceService({
        ownerId: "owner-a",
        store: base.store,
        now: () => START,
        monotonic: () => START,
        schedule: () => () => undefined,
        onRoomChanged: () => undefined,
        texts: { draw },
        racesOpen: true,
        log: () => undefined,
        logError: (message) => logged.push(message),
      });
      expect(await service.start(tab("t-host", "a-host").connection, {})).toEqual({ ok: false, error: "UNAVAILABLE" });
      expect(draw).not.toHaveBeenCalled();
      expect(base.store.startRace).not.toHaveBeenCalled();
      expect(logged).toEqual([`[races] start refused: room ${LOBBY} has settings races do not run yet`]);
    }
  });

  it("answers UNAVAILABLE, without drawing, when the room settings cannot be read", async () => {
    const draw = vi.fn(async (): Promise<RaceTextDraw> => ({ ok: false, reason: "NO_COMPATIBLE_PASSAGE" }));
    const { service, store } = harness({ texts: { draw } });
    store.readOwnRoomSettings.mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    expect(await service.start(tab("t-host", "a-host").connection, {})).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(draw).not.toHaveBeenCalled();
  });

  it("draws again with the new settings when the host saved some during the draw, once", async () => {
    const draw = vi.fn(fixedRaceTexts(FIXTURE_RACE_TEXTS).draw);
    const once = harness({ settingsChanges: 1, settings: { textLanguage: "en", wordCount: 10, timeLimitMs: 90_000 }, saved: { textLanguage: "fr", wordCount: 200, timeLimitMs: 60_000 }, texts: { draw } });
    expect(await once.service.start(tab("t-host", "a-host").connection, {})).toEqual({ ok: true });
    expect(draw.mock.calls.map(([settings]) => [settings.language, settings.wordCount])).toEqual([["en", 10], ["fr", 200]]);
    expect(once.store.startRace.mock.calls.map(([input]) => input.config["wordCount"])).toEqual([10, 200]);
    expect(
      once.store.startRace.mock.calls.map(([input]) => ({ revision: input.settingsRevision, text: input.text, timeLimitMs: input.config["timeLimitMs"] })),
    ).toEqual([
      { revision: 0, text: FIXTURE_RACE_TEXTS.en.text, timeLimitMs: 90_000 },
      { revision: 1, text: FIXTURE_RACE_TEXTS.fr.text, timeLimitMs: 60_000 },
    ]);
    expect(once.created[0]).toMatchObject({ timeLimit: 60_000 });
    expect(once.logged).toEqual([]);

    const always = harness({ settingsChanges: 2 });
    expect(await always.service.start(tab("t-host", "a-host").connection, {})).toEqual({ ok: false, error: "UNAVAILABLE" });
    expect(always.store.startRace).toHaveBeenCalledTimes(2);
    expect(always.service.ownsRace(LOBBY)).toBe(false);
    expect(always.logged).toEqual(["[races] start refused: the room settings changed during each draw"]);
  });

  it("refuses a second start from the same account while one is in flight", async () => {
    const { service } = harness();
    const host = tab("t-host", "a-host");
    const [first, second] = await Promise.all([service.start(host.connection, {}), service.start(host.connection, {})]);
    expect([first, second]).toEqual([{ ok: true }, { ok: false, error: "RATE_LIMITED" }]);
  });

  it("gives a tab's batches to its room's race, at most MAX_BATCHES_PER_SECOND a second", async () => {
    const { service, advance } = harness();
    const host = tab("t-host", "a-host");
    service.follow(LOBBY, host.connection);
    await service.start(host.connection, {});
    advance(COUNTDOWN_MS);
    const answers = Array.from({ length: MAX_BATCHES_PER_SECOND + 1 }, (_, index) => service.keystrokes(host.connection, batch(index + 1, "T")));
    expect(answers.slice(0, MAX_BATCHES_PER_SECOND).every((answer) => answer.ok)).toBe(true);
    expect(answers.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
    advance(1_000);
    expect(service.keystrokes(host.connection, { raceId: RACE, events: "nope" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    // A tab of no room, or of a room whose race does not run here.
    const elsewhere = tab("t-other", "a-other");
    expect(service.keystrokes(elsewhere.connection, batch(1, "T"))).toEqual({ ok: false, error: "NO_RACE" });
  });

  it("counts the batch limit per player, so tabs taking the input in turn do not multiply it", async () => {
    const { service, advance } = harness();
    const first = tab("t-1", "a-host");
    const second = tab("t-2", "a-host");
    service.follow(LOBBY, first.connection);
    service.follow(LOBBY, second.connection);
    await service.start(first.connection, {});
    advance(COUNTDOWN_MS);
    let seq = 1;
    for (let index = 0; index < MAX_BATCHES_PER_SECOND / 2; index += 1) {
      expect(service.keystrokes(first.connection, batch(seq, "T")).ok).toBe(true);
      seq += 1;
    }
    service.takeControl(second.connection, { raceId: RACE });
    for (let index = 0; index < MAX_BATCHES_PER_SECOND / 2; index += 1) {
      expect(service.keystrokes(second.connection, batch(seq, "T")).ok).toBe(true);
      seq += 1;
    }
    service.takeControl(first.connection, { raceId: RACE });
    expect(service.keystrokes(first.connection, batch(seq, "T"))).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("limits the control requests of one account, whatever its number of sockets", async () => {
    const { service, advance } = harness();
    const tabs = Array.from({ length: CONTROL_WINDOW.maxRequests + 2 }, (_, index) => tab(`t-${index}`, "a-host"));
    for (const each of tabs) {
      service.follow(LOBBY, each.connection);
    }
    await service.start(tabs[0]?.connection ?? tab("t", "a-host").connection, {});
    advance(COUNTDOWN_MS);
    const answers = tabs.slice(1).map((each) => service.takeControl(each.connection, { raceId: RACE }));
    expect(answers.slice(0, CONTROL_WINDOW.maxRequests).every((answer) => answer.ok)).toBe(true);
    expect(answers.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
    // A reconnection does not reset the window: it expires with time only.
    service.unfollow("t-1");
    service.follow(LOBBY, tab("t-again", "a-host").connection);
    expect(service.takeControl(tab("t-again", "a-host").connection, { raceId: RACE })).toEqual({ ok: false, error: "RATE_LIMITED" });
    advance(CONTROL_WINDOW.windowMs);
    expect(service.takeControl(tab("t-again", "a-host").connection, { raceId: RACE })).toEqual({ ok: true });
  });

  it("lets a page that took the input by request take it back after reconnecting, before its old socket closes", async () => {
    const { service, advance } = harness();
    const pageOne = { ...tab("t-1", "a-host").connection, pageId: "page-1" };
    const pageTwo = { ...tab("t-2", "a-host").connection, pageId: "page-2" };
    service.follow(LOBBY, pageOne);
    service.follow(LOBBY, pageTwo);
    await service.start(pageOne, {});
    advance(COUNTDOWN_MS);
    // As the race channel builds it: the request's connection carries no page id.
    expect(service.takeControl({ ...pageTwo, pageId: undefined }, { raceId: RACE })).toEqual({ ok: true });
    const pageTwoAgain = { ...tab("t-2b", "a-host").connection, pageId: "page-2" };
    service.follow(LOBBY, pageTwoAgain);
    expect(service.keystrokes(pageTwoAgain, batch(1, "T"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    expect(service.keystrokes(pageTwo, batch(2, "e"))).toEqual({ ok: false, error: "NOT_CONTROLLING" });
  });

  it("hands « Je suis là » and abandons to the race of the tab's room, for that race only, within a window per account", async () => {
    const { service, advance } = harness();
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    expect(service.present(bea.connection, { raceId: RACE })).toEqual({ ok: false, error: "NO_RACE" });
    await service.start(host.connection, {});
    advance(COUNTDOWN_MS);
    expect(service.present(bea.connection, { raceId: RACE, extra: true })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(service.present(bea.connection, { raceId: "2b3c4d5e-6f70-4182-a3b4-c5d6e7f80912" })).toEqual({ ok: false, error: "NO_RACE" });
    expect(service.present(bea.connection, { raceId: RACE })).toEqual({ ok: true });
    // A socket that does not follow the room (or another account on that socket id) gets nothing.
    expect(service.abandon({ ...bea.connection, accountId: "a-host" }, { raceId: RACE })).toEqual({ ok: false, error: "NO_RACE" });
    expect(service.abandon(bea.connection, { raceId: RACE })).toEqual({ ok: true });
    // Bea has used 4: the request before the race and the wrong race count too; the invalid payload does not.
    for (let index = 4; index < ENTRANT_ACTION_WINDOW.maxRequests; index += 1) {
      expect(service.present(bea.connection, { raceId: RACE })).toEqual({ ok: true });
    }
    expect(service.present(bea.connection, { raceId: RACE })).toEqual({ ok: false, error: "RATE_LIMITED" });
    advance(ENTRANT_ACTION_WINDOW.windowMs);
    expect(service.present(bea.connection, { raceId: RACE })).toEqual({ ok: true });
  });

  it("keeps « Je suis là » a presence, never an abandon, and refuses a race id that is not a UUID", async () => {
    const { service, advance } = harness();
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    const beaTwo = tab("t-bea-2", "a-bea");
    for (const one of [host, bea, beaTwo]) {
      service.follow(LOBBY, one.connection);
    }
    await service.start(host.connection, {});
    advance(COUNTDOWN_MS);
    expect(service.present(bea.connection, { raceId: "not-a-uuid" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(service.present(bea.connection, { raceId: RACE })).toEqual({ ok: true });
    advance(1_000);
    const progress = host.received.filter((message) => message.event === RACE_PROGRESS_EVENT).at(-1)?.payload as RaceProgressPayload | undefined;
    expect(progress?.broadcast.entrants.find((one) => one.entrantId === "e-bea")).toMatchObject({ status: "racing" });
    // One window for the account, whatever its number of sockets.
    for (let index = 1; index < ENTRANT_ACTION_WINDOW.maxRequests; index += 1) {
      service.present(index % 2 === 0 ? bea.connection : beaTwo.connection, { raceId: RACE });
    }
    expect(service.present(beaTwo.connection, { raceId: RACE })).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("resumes an entrant whose only tab comes back within the grace: it is still racing after it", async () => {
    const { service, advance } = harness();
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    await service.start(host.connection, {});
    advance(COUNTDOWN_MS);
    service.unfollow("t-bea");
    advance(10_000);
    service.follow(LOBBY, tab("t-bea-back", "a-bea").connection);
    for (let second = 0; second <= RESUME_GRACE_MS / 1_000; second += 1) {
      advance(1_000);
      for (let turn = 0; turn < 10; turn += 1) {
        await Promise.resolve();
      }
    }
    const progress = host.received.filter((message) => message.event === RACE_PROGRESS_EVENT).at(-1)?.payload as RaceProgressPayload | undefined;
    expect(progress?.broadcast.entrants.find((one) => one.entrantId === "e-bea")).toMatchObject({ status: "racing" });
  });

  it("tells the race which account's tab left, so the loss of its last tab starts the grace", async () => {
    const { service, advance } = harness();
    const host = tab("t-host", "a-host");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    await service.start(host.connection, {});
    advance(COUNTDOWN_MS);
    service.unfollow("t-bea");
    // Second by second, letting the lease's renewals answer: past the grace, Bea abandons.
    for (let second = 0; second <= RESUME_GRACE_MS / 1_000; second += 1) {
      advance(1_000);
      for (let turn = 0; turn < 10; turn += 1) {
        await Promise.resolve();
      }
    }
    const progress = host.received.filter((message) => message.event === RACE_PROGRESS_EVENT).at(-1)?.payload as RaceProgressPayload | undefined;
    expect(progress?.broadcast.entrants.find((one) => one.entrantId === "e-bea")).toMatchObject({ status: "abandoned" });
    expect(progress?.broadcast.entrants.find((one) => one.entrantId === "e-host")).toMatchObject({ status: "racing" });
  });

  it("keeps the batch window of an account whose every tab left and came back", async () => {
    const { service, advance } = harness();
    const only = tab("t-only", "a-host");
    service.follow(LOBBY, only.connection);
    await service.start(only.connection, {});
    advance(COUNTDOWN_MS);
    for (let index = 0; index < MAX_BATCHES_PER_SECOND; index += 1) {
      service.keystrokes(only.connection, batch(index + 1, "T"));
    }
    // Every tab of the account leaves, then one comes back: the window is not reset.
    service.unfollow("t-only");
    const back = tab("t-back", "a-host");
    service.follow(LOBBY, back.connection);
    expect(service.keystrokes(back.connection, batch(11, "e"))).toEqual({ ok: false, error: "RATE_LIMITED" });
    advance(1_000);
    expect(service.keystrokes(back.connection, batch(11, "e")).ok).toBe(true);
  });

  it("logs a failed lease renewal once per outage, and again for the next outage", async () => {
    const logged: string[] = [];
    const base = harness();
    const renewalLogs = () => logged.filter((line) => line.includes("lease renewal")).length;
    // Renewals 1 to 4 fail (one outage), the 5th succeeds, the next ones fail (a second outage).
    // Each renewal records how many failure lines were logged before it.
    const loggedBefore: number[] = [];
    const renew = async () => {
      loggedBefore.push(renewalLogs());
      if (loggedBefore.length === 5) {
        return { renewed: true };
      }
      throw new Error("ECONNREFUSED");
    };
    const service = new RaceService({
      ownerId: "owner-a",
      store: { ...base.store, renewRaceLease: renew },
      now: () => START,
      monotonic: () => START,
      schedule: (callback, delayMs) => {
        const timer = setTimeout(callback, Math.min(delayMs, 5));
        return () => clearTimeout(timer);
      },
      onRoomChanged: () => undefined,
      texts: fixedRaceTexts(FIXTURE_RACE_TEXTS),
      racesOpen: true,
      log: () => undefined,
      logError: (message) => logged.push(message),
      leaseTiming: { leaseMs: 30_000, renewEveryMs: 1, safetyMarginMs: 5_000, retryEveryMs: 1, maxSuspensionMs: 60_000 },
    });
    await service.start(tab("t-host", "a-host").connection, {});
    // Waited for by count, not for a fixed time (a busy machine may run a single renewal in a
    // short window), and not for the first log: eight renewals span both outages. Bounded below
    // the test's own timeout, so a failure says how far the renewals got; stopped either way.
    try {
      await vi.waitFor(() => expect(loggedBefore.length).toBeGreaterThanOrEqual(8), { timeout: 2_000, interval: 5 });
    } finally {
      await service.stop({ onEnded: () => undefined, timeoutMs: 100 });
    }
    // Renewals 2 to 5 see the first outage's single line (four failed attempts, one line), the 6th
    // sees no new line after the success, the 7th and 8th see the second outage's own line.
    expect(loggedBefore.slice(0, 8)).toEqual([0, 1, 1, 1, 1, 1, 2, 2]);
    expect(renewalLogs()).toBe(2);
  });

  it("limits the starts of one account, whatever its number of sockets", async () => {
    const { service } = harness({ refusal: "NOT_HOST" });
    const answers = [];
    for (let index = 0; index <= START_WINDOW.maxStarts; index += 1) {
      answers.push(await service.start(tab(`t-${index}`, "a-bea").connection, {}));
    }
    expect(answers.slice(0, START_WINDOW.maxStarts).every((answer) => !answer.ok && answer.error === "NOT_HOST")).toBe(true);
    expect(answers.at(-1)).toEqual({ ok: false, error: "RATE_LIMITED" });
  });

  it("moves the input between the tabs of one entrant on request, and forgets a closed tab", async () => {
    const { service, advance } = harness();
    const first = tab("t-1", "a-host");
    const second = tab("t-2", "a-host");
    service.follow(LOBBY, first.connection);
    await service.start(first.connection, {});
    service.follow(LOBBY, second.connection);
    advance(COUNTDOWN_MS);
    expect(service.keystrokes(second.connection, batch(1, "T"))).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(service.takeControl(second.connection, { raceId: "00000000-0000-4000-8000-000000000000" })).toEqual({ ok: false, error: "NO_RACE" });
    expect(service.takeControl(second.connection, { raceId: RACE })).toEqual({ ok: true });
    expect(service.keystrokes(second.connection, batch(1, "T"))).toMatchObject({ ok: true });
    service.unfollow(second.connection.id);
    expect(service.keystrokes(second.connection, batch(2, "e"))).toEqual({ ok: false, error: "NO_RACE" });
    // The typing tab is gone: after the grace, the entrant's remaining tab takes the input.
    advance(3_000);
    const third = tab("t-3", "a-host");
    service.follow(LOBBY, third.connection);
    expect(service.keystrokes(third.connection, batch(2, "e"))).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    expect(service.keystrokes(first.connection, batch(2, "e"))).toMatchObject({ ok: true, result: { outcome: "applied" } });
  });

  it("abandons a member who left the room, and ends the race when the room closed", async () => {
    const left = harness();
    const host = tab("t-host", "a-host");
    left.service.follow(LOBBY, host.connection);
    await left.service.start(host.connection, {});
    left.advance(COUNTDOWN_MS);
    left.service.memberLeft(LOBBY, "a-bea", { roomClosed: false });
    expect(left.service.ownsRace(LOBBY)).toBe(true);
    // The host finishes the fixture text: the leaver is ranked as an abandon (state-machines §3).
    const text = [...FIXTURE_RACE_TEXTS.fr.text];
    for (const [index, grapheme] of text.entries()) {
      left.advance(200);
      expect(left.service.keystrokes(host.connection, batch(index + 1, grapheme))).toMatchObject({ ok: true, result: { outcome: "applied" } });
    }
    await vi.waitFor(() => expect(left.store.finalizeRace).toHaveBeenCalledOnce());
    const [, rows] = left.store.finalizeRace.mock.calls[0] as unknown as [unknown, readonly { entrantId: string; outcome: string; abandonmentReason?: string }[]];
    expect(rows.map((row) => [row.entrantId, row.outcome, row.abandonmentReason])).toEqual([
      ["e-host", "finished", undefined],
      ["e-bea", "abandoned", "voluntary"],
    ]);

    const closed = harness();
    await closed.service.start(tab("t-host", "a-host").connection, {});
    closed.service.memberLeft(LOBBY, "a-host", { roomClosed: true });
    expect(closed.service.ownsRace(LOBBY)).toBe(false);
    expect(closed.store.interruptOwnRace).not.toHaveBeenCalled();
  });

  it("signals a race that stopped here without a confirmed end, so its room is watched until it has one", async () => {
    const { service, lost, advance } = harness({ renewed: false });
    await service.start(tab("t-host", "a-host").connection, {});
    advance(10_000);
    await vi.waitFor(() => expect(lost).toEqual([LOBBY]));
    expect(service.ownsRace(LOBBY)).toBe(false);
  });

  it("refuses new starts once stopping, and ends its races through their own shutdown", async () => {
    const { service, store } = harness();
    await service.start(tab("t-host", "a-host").connection, {});
    const ended: string[] = [];
    const report = await service.stop({ onEnded: (lobbyId) => ended.push(lobbyId), timeoutMs: 5_000 });
    expect(report).toEqual({ finalised: 0, interrupted: 1, left: 0, timedOut: false });
    expect(store.interruptOwnRace).toHaveBeenCalledWith(expect.objectContaining({ raceId: RACE }), "server_stopped");
    expect(ended).toEqual([LOBBY]);
    expect(await service.start(tab("t-host", "a-host").connection, {})).toEqual({ ok: false, error: "UNAVAILABLE" });
  });
});

describe("guest host race starts", () => {
  const proof = { id: "guest-session", secretDigest: "synthetic-digest" };
  const guest = { id: "guest-tab", accountId: null, memberId: "guest-member", emit: () => undefined } as const;

  it("passes the server proof to the transactional start, never impersonating an account", async () => {
    const app = harness();
    expect(await app.service.startGuest(guest, proof, {})).toEqual({ ok: true });
    expect(app.store.readGuestRoomSettings).toHaveBeenCalledExactlyOnceWith(proof);
    expect(app.store.startRace).toHaveBeenCalledWith(expect.objectContaining({ accountId: null, guestProof: proof }));
  });

  it("refuses a guest non-host before drawing or writing", async () => {
    const app = harness({ room: { isHost: false } });
    expect(await app.service.startGuest(guest, proof, {})).toEqual({ ok: false, error: "NOT_HOST" });
    expect(app.store.startRace).not.toHaveBeenCalled();
  });

  it("shares guest start limits across tabs without colliding with an account of the same ID", async () => {
    const app = harness({ room: { isHost: false } });
    for (let n = 0; n < START_WINDOW.maxStarts; n++) {
      expect(await app.service.startGuest({ ...guest, id: `tab-${n}` }, proof, {})).toEqual({ ok: false, error: "NOT_HOST" });
    }
    expect(await app.service.startGuest(guest, proof, {})).toEqual({ ok: false, error: "RATE_LIMITED" });
    expect(await app.service.start({ id: "account-tab", accountId: guest.memberId, emit: () => undefined }, {})).toEqual({ ok: false, error: "NOT_HOST" });
  });
});
