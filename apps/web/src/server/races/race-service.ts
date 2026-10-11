import { describeDatabaseError, type RaceOwnership, type StartRaceInput, type StartRaceResult } from "@incision/database";
import {
  asDuration,
  asEntrantId,
  asInstant,
  asRaceId,
  createRace,
  type CreateRaceRefusal,
  type ErrorMode,
  MAX_BATCHES_PER_SECOND,
  type RaceState,
} from "@incision/domain";
import type { Locale } from "../../i18n/locale";
import { parseKeystrokeBatch, type RaceBatchAck, type RaceControlAck, raceControlPayloadSchema, type RaceStartAck, raceStartPayloadSchema } from "../../races/protocol";
import { LEASE_TIMING, RaceLease, type Schedule } from "./race-lease";
import { RaceRegistry, type StopReport } from "./race-registry";
import { type RaceConnection, RaceRuntime, type RaceStore, type RuntimeTiming } from "./race-runtime";
import { FIXTURE_RACE_TEXTS } from "./race-texts";

/** A tab admitted into a room by the room channel, with the language its pages use. */
export type RoomConnection = RaceConnection & { readonly locale: Locale };

/** The first race path (F-04.0): mandatory correction (D-19) and an explicit 120 s limit, announced and shown. */
export const FIRST_RACE_SETTINGS = { errorMode: "mandatory" satisfies ErrorMode, timeLimitMs: 120_000 } as const;
/** Version of the rules a race was run under, kept with it. */
const RULES_VERSION = 1;
/** Starts one account may ask for, whatever its number of sockets (each takes the room lock). */
export const START_WINDOW = { maxStarts: 5, windowMs: 10_000 } as const;

export type RaceServiceOptions = {
  readonly ownerId: string;
  readonly store: RaceStore & {
    readonly startRace: (input: StartRaceInput<CreateRaceRefusal, RaceState>) => Promise<StartRaceResult<CreateRaceRefusal, RaceState>>;
    readonly renewRaceLease: (ownership: RaceOwnership) => Promise<{ readonly renewed: boolean }>;
  };
  /** The server's clock (`serverClock`), in integer milliseconds since the epoch. */
  readonly now: () => number;
  /** A monotonic clock for the leases (never the wall clock). */
  readonly monotonic: () => number;
  readonly schedule: Schedule;
  /** A room's race changed in the database (started, saved, interrupted): its members get a fresh snapshot. */
  readonly onRoomChanged: (lobbyId: string) => void;
  readonly log: (message: string) => void;
  /** Failures; `log` when not given. */
  readonly logError?: (message: string) => void;
  readonly leaseTiming?: typeof LEASE_TIMING;
  readonly runtimeTiming?: Partial<RuntimeTiming>;
};

/**
 * The races this process runs (F-04.0): starts them, hands each tab's messages to its room's
 * race, and stops them with the process. Tabs come from the room channel, which checked the
 * session and the membership; the entrant always comes from the session's account.
 */
export class RaceService {
  readonly #options: RaceServiceOptions;
  readonly #registry = new RaceRegistry<RaceRuntime>();
  /** Room → its tabs, as the room channel follows them. */
  readonly #followers = new Map<string, Map<string, RoomConnection>>();
  /** Tab → its room. */
  readonly #rooms = new Map<string, string>();
  /**
   * Player (account) → when its last batches arrived, for MAX_BATCHES_PER_SECOND: per player,
   * so that tabs taking the input in turn do not multiply it.
   */
  readonly #batchTimes = new Map<string, number[]>();
  /** Account → its recent starts, whatever its number of sockets. */
  readonly #startTimes = new Map<string, number[]>();
  readonly #starting = new Set<string>();

  constructor(options: RaceServiceOptions) {
    this.#options = options;
  }

  ownsRace(lobbyId: string): boolean {
    return this.#registry.ownsRace(lobbyId);
  }

  /** The room channel admitted this tab into the room: it gets the race, if one runs here. */
  follow(lobbyId: string, connection: RoomConnection): void {
    const previous = this.#rooms.get(connection.id);
    if (previous !== undefined && previous !== lobbyId) {
      this.unfollow(connection.id);
    }
    let tabs = this.#followers.get(lobbyId);
    if (tabs === undefined) {
      tabs = new Map();
      this.#followers.set(lobbyId, tabs);
    }
    tabs.set(connection.id, connection);
    this.#rooms.set(connection.id, lobbyId);
    this.#registry.get(lobbyId)?.follow(connection);
  }

  /** The tab closed, or no longer follows its room. */
  unfollow(connectionId: string): void {
    const lobbyId = this.#rooms.get(connectionId);
    this.#rooms.delete(connectionId);
    if (lobbyId === undefined) {
      return;
    }
    const tabs = this.#followers.get(lobbyId);
    const accountId = tabs?.get(connectionId)?.accountId;
    tabs?.delete(connectionId);
    if (accountId !== undefined && !this.#follows(accountId)) {
      this.#batchTimes.delete(accountId);
    }
    if (tabs?.size === 0) {
      this.#followers.delete(lobbyId);
    }
    this.#registry.get(lobbyId)?.unfollow(connectionId);
  }

  /**
   * The host starts the race (COURSE-02/03). The room, the host and the participants are
   * checked under the room lock, where the engine creates the race (`createRace`, with its own
   * checks); once that commits, this process runs it under its lease (ADR-0004).
   */
  async start(connection: RoomConnection, payload: unknown): Promise<RaceStartAck> {
    if (!raceStartPayloadSchema.safeParse(payload).success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    if (this.#registry.stopping) {
      return { ok: false, error: "UNAVAILABLE" };
    }
    if (!this.#withinWindow(this.#startTimes, connection.accountId, START_WINDOW.maxStarts, START_WINDOW.windowMs)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    // One start in flight per account; the database refuses a second start of the room anyway.
    if (this.#starting.has(connection.accountId)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    this.#starting.add(connection.accountId);
    try {
      return await this.#start(connection);
    } finally {
      this.#starting.delete(connection.accountId);
    }
  }

  async #start(connection: RoomConnection): Promise<RaceStartAck> {
    const { store, ownerId } = this.#options;
    const text = FIXTURE_RACE_TEXTS[connection.locale];
    const timeLimit = asDuration(FIRST_RACE_SETTINGS.timeLimitMs);
    const acquiredAt = this.#options.monotonic();
    let started: StartRaceResult<CreateRaceRefusal, RaceState>;
    try {
      started = await store.startRace({
        accountId: connection.accountId,
        ownerId,
        text,
        config: { errorMode: FIRST_RACE_SETTINGS.errorMode, timeLimitMs: FIRST_RACE_SETTINGS.timeLimitMs, language: connection.locale, text: "fixture" },
        rulesVersion: RULES_VERSION,
        // Under the room lock: a refusal changes nothing, an exception rolls the start back.
        create: ({ raceId, entrants }) =>
          createRace({
            raceId: asRaceId(raceId),
            text,
            errorMode: FIRST_RACE_SETTINGS.errorMode,
            timeLimit,
            participants: entrants.map(({ entrantId, kind }) => ({ entrantId: asEntrantId(entrantId), kind })),
            now: asInstant(this.#options.now()),
          }),
      });
    } catch (error: unknown) {
      this.#logError(`[races] start failed: ${describeDatabaseError(error)}`);
      return { ok: false, error: "UNAVAILABLE" };
    }
    if (!started.ok) {
      const { error } = started;
      if (error === "NOT_IN_A_ROOM" || error === "NOT_HOST" || error === "ROOM_NOT_WAITING" || error === "NOT_ENOUGH_PARTICIPANTS" || error === "NO_HUMAN_PARTICIPANT") {
        return { ok: false, error };
      }
      // The text and the settings are the server's: any other refusal is a bug here.
      this.#logError(`[races] start refused by the engine: ${error}`);
      return { ok: false, error: "UNAVAILABLE" };
    }
    const ownership: RaceOwnership = started.race;
    const runtime = this.#runtime(ownership, started.created, started.entrants, acquiredAt);
    if (!this.#registry.add(runtime)) {
      // The process began stopping during the start.
      await this.#interrupt(ownership, "server_stopped");
      return { ok: false, error: "UNAVAILABLE" };
    }
    runtime.start();
    this.#options.onRoomChanged(ownership.lobbyId);
    return { ok: true };
  }

  #runtime(ownership: RaceOwnership, state: RaceState, entrants: readonly { entrantId: string; accountId: string; displayName: string }[], acquiredAt: number): RaceRuntime {
    const { store, schedule, log } = this.#options;
    const lease = new RaceLease({
      renew: async () => (await store.renewRaceLease(ownership)).renewed,
      now: this.#options.monotonic,
      schedule,
      acquiredAt,
      // Called by the lease's timers and renewals, never during this constructor.
      onChange: (leaseState) => runtime.leaseChanged(leaseState),
      ...(this.#options.leaseTiming === undefined ? {} : { timing: this.#options.leaseTiming }),
    });
    const runtime = new RaceRuntime({
      ownership,
      state,
      entrants,
      store,
      lease,
      now: this.#options.now,
      schedule,
      followers: () => this.#followers.get(ownership.lobbyId)?.values() ?? [],
      onSettled: (settled) => {
        this.#registry.remove(settled);
        this.#options.onRoomChanged(settled.lobbyId);
      },
      log,
      logError: (message) => this.#logError(message),
      ...(this.#options.runtimeTiming === undefined ? {} : { timing: this.#options.runtimeTiming }),
    });
    return runtime;
  }

  async #interrupt(ownership: RaceOwnership, reason: "server_stopped"): Promise<void> {
    try {
      await this.#options.store.interruptOwnRace(ownership, reason);
    } catch (error: unknown) {
      // The lease expires and the race is recovered as owner_lost.
      this.#logError(`[races] interruption of ${ownership.raceId} failed: ${describeDatabaseError(error)}`);
    }
    this.#options.onRoomChanged(ownership.lobbyId);
  }

  /** One keystroke batch from a tab (F-04.4): bounded per tab, structure checked, then the engine. */
  keystrokes(connection: RoomConnection, payload: unknown): RaceBatchAck {
    if (!this.#withinWindow(this.#batchTimes, connection.accountId, MAX_BATCHES_PER_SECOND, 1_000)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    const parsed = parseKeystrokeBatch(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    const runtime = this.#runtimeOf(connection.id);
    return runtime === undefined ? { ok: false, error: "NO_RACE" } : runtime.keystrokes(connection, parsed.data);
  }

  /** A second tab asks for the input (state-machines §2). */
  takeControl(connection: RoomConnection, payload: unknown): RaceControlAck {
    const parsed = raceControlPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    const runtime = this.#runtimeOf(connection.id);
    if (runtime === undefined || runtime.ownership.raceId !== parsed.data.raceId) {
      return { ok: false, error: "NO_RACE" };
    }
    const answer = runtime.takeControl(connection);
    return answer === "ok" ? { ok: true } : { ok: false, error: answer };
  }

  /** A member left the room (committed): an abandon, or the end of the race if the room closed. */
  memberLeft(lobbyId: string, accountId: string, { roomClosed }: { readonly roomClosed: boolean }): void {
    const runtime = this.#registry.get(lobbyId);
    if (runtime === undefined) {
      return;
    }
    if (roomClosed) {
      runtime.roomClosed();
    } else {
      runtime.memberLeft(accountId);
    }
  }

  /** SIGTERM: no new start, then each race ends through its own shutdown (ADR-0004). */
  stop(options: { readonly onEnded: (lobbyId: string) => void; readonly timeoutMs: number }): Promise<StopReport> {
    return this.#registry.stop({ ...options, now: this.#options.now });
  }

  /** Counts one more event for `key` in its sliding window; false when the window is full. */
  #withinWindow(windows: Map<string, number[]>, key: string, max: number, windowMs: number): boolean {
    const now = this.#options.monotonic();
    const recent = (windows.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= max) {
      windows.set(key, recent);
      return false;
    }
    recent.push(now);
    windows.set(key, recent);
    return true;
  }

  #follows(accountId: string): boolean {
    for (const tabs of this.#followers.values()) {
      for (const tab of tabs.values()) {
        if (tab.accountId === accountId) {
          return true;
        }
      }
    }
    return false;
  }

  #logError(message: string): void {
    (this.#options.logError ?? this.#options.log)(message);
  }

  #runtimeOf(connectionId: string): RaceRuntime | undefined {
    const lobbyId = this.#rooms.get(connectionId);
    return lobbyId === undefined ? undefined : this.#registry.get(lobbyId);
  }
}

/**
 * The server's clock for races: milliseconds since the epoch that never go backwards within the
 * process (the engine's `Instant`), whatever the wall clock does meanwhile.
 */
export function serverClock(): number {
  return Math.floor(performance.timeOrigin + performance.now());
}
