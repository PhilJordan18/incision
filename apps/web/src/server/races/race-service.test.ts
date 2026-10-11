import type { Interruption, RaceToCreate, StartRaceInput, StartRaceResult, Transition } from "@incision/database";
import { COUNTDOWN_MS, type CreateRaceRefusal, MAX_BATCHES_PER_SECOND, type RaceState } from "@incision/domain";
import { describe, expect, it, vi } from "vitest";
import { RACE_REVEAL_EVENT, type RaceRevealPayload } from "../../races/protocol";
import { CONTROL_WINDOW, FIRST_RACE_SETTINGS, RaceService, type RoomConnection, START_WINDOW } from "./race-service";
import { FIXTURE_RACE_TEXTS } from "./race-texts";

const START = 1_800_000_000_000;
const LOBBY = "lobby-1";
const RACE = "6f1d2c3b-4a5e-4f60-8a7b-9c8d7e6f5a4b";
const PARTICIPANTS = [
  { entrantId: "e-host", accountId: "a-host", memberId: "m-host", ordinal: 1, displayName: "Hôte" },
  { entrantId: "e-bea", accountId: "a-bea", memberId: "m-bea", ordinal: 2, displayName: "Bea" },
];

function harness(
  options: { refusal?: "NOT_HOST" | "NOT_ENOUGH_PARTICIPANTS"; participants?: typeof PARTICIPANTS; renewed?: boolean; noTexts?: boolean } = {},
) {
  let now = START;
  const timers: { at: number; callback: () => void }[] = [];
  const created: RaceState[] = [];
  const startRace = vi.fn(async (input: StartRaceInput<CreateRaceRefusal, RaceState>): Promise<StartRaceResult<CreateRaceRefusal, RaceState>> => {
    if (options.refusal !== undefined) {
      return { ok: false, error: options.refusal };
    }
    const entrants = options.participants ?? PARTICIPANTS;
    const toCreate: RaceToCreate = { raceId: RACE, entrants: entrants.map(({ entrantId }) => ({ entrantId, kind: "human" as const })) };
    const result = input.create(toCreate);
    if (!result.ok) {
      return { ok: false, error: result.reason };
    }
    created.push(result.race);
    return {
      ok: true,
      race: { raceId: RACE, lobbyId: LOBBY, ownerId: "owner-a", ownerEpoch: 1, roundNo: 1, countdownAt: new Date(START), leaseExpiresAt: new Date(START + 30_000) },
      entrants,
      created: result.race,
    };
  });
  const store = {
    startRace,
    beginRacing: vi.fn(async (): Promise<Transition> => ({ won: true, alreadyDone: false })),
    finalizeRace: vi.fn(async (): Promise<Transition> => ({ won: true, alreadyDone: false })),
    interruptOwnRace: vi.fn(async (): Promise<Interruption> => ({ won: true, alreadyDone: false })),
    renewRaceLease: vi.fn(async () => ({ renewed: options.renewed ?? true })),
  };
  const changed: string[] = [];
  const lost: string[] = [];
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
    texts: options.noTexts === true ? undefined : FIXTURE_RACE_TEXTS,
    log: () => undefined,
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
  return { service, store, created, changed, lost, advance };
}

function tab(id: string, accountId: string, locale: "fr" | "en" = "fr") {
  const received: { event: string; payload: unknown }[] = [];
  const connection: RoomConnection = { id, accountId, locale, emit: (event, payload) => void received.push({ event, payload }) };
  return { connection, received, reveal: () => received.find((message) => message.event === RACE_REVEAL_EVENT)?.payload as RaceRevealPayload | undefined };
}

const batch = (seq: number, grapheme: string) => ({ raceId: RACE, seq, textVersion: 0, events: [{ type: "insert", grapheme }] });

describe("RaceService", () => {
  it("has the engine create the race in the host's language, with the first path's settings, and runs it here", async () => {
    const { service, store, created, changed } = harness();
    const host = tab("t-host", "a-host", "en");
    const bea = tab("t-bea", "a-bea");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: true });
    const input = store.startRace.mock.calls[0]?.[0];
    expect(input).toMatchObject({ accountId: "a-host", ownerId: "owner-a", text: FIXTURE_RACE_TEXTS.en, rulesVersion: 1 });
    expect(input?.config).toEqual({ errorMode: "mandatory", timeLimitMs: 120_000, language: "en", text: "fixture" });
    expect(created[0]).toMatchObject({ phase: "countdown", errorMode: FIRST_RACE_SETTINGS.errorMode, timeLimit: 120_000, startsAt: START + COUNTDOWN_MS });
    expect(service.ownsRace(LOBBY)).toBe(true);
    expect(changed).toEqual([LOBBY]);
    // The text reaches the room's tabs only now, never before the countdown (COURSE-03).
    expect(bea.reveal()?.reveal.text.join("")).toBe(FIXTURE_RACE_TEXTS.en);
    expect(bea.reveal()?.selfEntrantId).toBe("e-bea");
  });

  it("marks the race text with the host's language for every reader", async () => {
    const { service } = harness();
    const host = tab("t-host", "a-host", "en");
    const bea = tab("t-bea", "a-bea", "fr");
    service.follow(LOBBY, host.connection);
    service.follow(LOBBY, bea.connection);
    await service.start(host.connection, {});
    expect(bea.reveal()?.language).toBe("en");
    expect(host.reveal()?.language).toBe("en");
  });

  it("refuses every start, before the database, when no race text may run on this server", async () => {
    const { service, store } = harness({ noTexts: true });
    const host = tab("t-host", "a-host");
    service.follow(LOBBY, host.connection);
    expect(await service.start(host.connection, {})).toEqual({ ok: false, error: "RACES_UNAVAILABLE" });
    expect(store.startRace).not.toHaveBeenCalled();
    expect(service.ownsRace(LOBBY)).toBe(false);
  });

  it("passes the database's and the engine's refusals on, and runs nothing", async () => {
    const notHost = harness({ refusal: "NOT_HOST" });
    expect(await notHost.service.start(tab("t", "a-bea").connection, {})).toEqual({ ok: false, error: "NOT_HOST" });
    // The engine's own start rule, applied under the room lock (COURSE-02).
    const alone = harness({ participants: PARTICIPANTS.slice(0, 1) });
    expect(await alone.service.start(tab("t", "a-host").connection, {})).toEqual({ ok: false, error: "NOT_ENOUGH_PARTICIPANTS" });
    expect(alone.service.ownsRace(LOBBY)).toBe(false);
    expect(await alone.service.start(tab("t", "a-host").connection, { text: "mine" })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
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
    const failing = harness();
    // Down, then up once, then down again.
    let calls = 0;
    const renew = vi.fn(async () => {
      calls += 1;
      if (calls === 5) {
        return { renewed: true };
      }
      throw new Error("ECONNREFUSED");
    });
    const service = new RaceService({
      ownerId: "owner-a",
      store: { ...failing.store, renewRaceLease: renew },
      now: () => START,
      monotonic: () => START,
      schedule: (callback, delayMs) => {
        const timer = setTimeout(callback, Math.min(delayMs, 5));
        return () => clearTimeout(timer);
      },
      onRoomChanged: () => undefined,
      texts: FIXTURE_RACE_TEXTS,
      log: () => undefined,
      logError: (message) => logged.push(message),
      leaseTiming: { leaseMs: 30_000, renewEveryMs: 1, safetyMarginMs: 5_000, retryEveryMs: 1, maxSuspensionMs: 60_000 },
    });
    await service.start(tab("t-host", "a-host").connection, {});
    // Several renewals fail within this time, one every millisecond or so.
    await new Promise((resolve) => setTimeout(resolve, 60));
    await service.stop({ onEnded: () => undefined, timeoutMs: 100 });
    expect(calls).toBeGreaterThan(6);
    expect(logged.filter((line) => line.includes("lease renewal")).length).toBe(2);
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
    const text = [...FIXTURE_RACE_TEXTS.fr];
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
