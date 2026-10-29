import { describeDatabaseError, type GuestSessionProof, type GuestSessionRow, type OwnRoomSettings, type RaceOwnership, type StartRaceInput, type StartRaceResult } from "@incision/database";
import {
  asDuration,
  asEntrantId,
  asInstant,
  asRaceId,
  createBonusRace,
  createRaceRefusal,
  type CreateRaceRefusal,
  MAX_BATCHES_PER_SECOND,
  type BonusRaceState,
} from "@incision/domain";
import type { Locale } from "../../i18n/locale";
import { bonusActivationPayloadSchema, type BonusActivationAck } from "../../races/bonus-protocol";
import {
  parseKeystrokeBatch,
  type RaceBatchAck,
  type RaceControlAck,
  raceControlPayloadSchema,
  type RaceEntrantActionAck,
  raceEntrantActionPayloadSchema,
  type RaceStartAck,
  raceStartPayloadSchema,
} from "../../races/protocol";
import { type LeaseTiming, RaceLease, type Schedule } from "./race-lease";
import { RaceRegistry, type StopReport } from "./race-registry";
import { type RaceConnection, raceConnectionKey, RaceRuntime, type RaceStore, type RuntimeTiming } from "./race-runtime";
import type { RaceTextDraw, RaceTextSource } from "./race-texts";
import { isRunnable } from "../rooms/room-settings";
import { BonusActivationLimiter } from "./bonus-limiter";

/** A tab admitted into a room by the room channel. */
export type RoomConnection = RaceConnection;
type StartConnection = (RoomConnection & { readonly accountId: string }) |
  (RoomConnection & { readonly accountId: null; readonly guestProof: GuestSessionProof });

/**
 * Draws a start makes at most: settings saved between the draw and the room lock refuse the start
 * (SETTINGS_CHANGED), and it draws again with the new ones, once.
 */
const START_DRAWS = 2;
/** Version of the rules a race was run under, kept with it. */
const RULES_VERSION = 1;
/** Starts one account may ask for, whatever its number of sockets (each takes the room lock). */
export const START_WINDOW = { maxStarts: 5, windowMs: 10_000 } as const;
/** MAX_BATCHES_PER_SECOND is counted over this sliding window. */
const BATCH_WINDOW_MS = 1_000;
/** Control requests one account may make, whatever its number of sockets. */
export const CONTROL_WINDOW = { maxRequests: 5, windowMs: 10_000 } as const;
/** « Je suis là » and abandons one account may send, together, whatever its number of sockets. */
export const ENTRANT_ACTION_WINDOW = { maxRequests: 5, windowMs: 10_000 } as const;

export type RaceServiceOptions = {
  readonly ownerId: string;
  readonly store: RaceStore & {
    readonly startRace: (input: StartRaceInput<CreateRaceRefusal, BonusRaceState>) => Promise<StartRaceResult<CreateRaceRefusal, BonusRaceState>>;
    readonly renewRaceLease: (ownership: RaceOwnership) => Promise<{ readonly renewed: boolean }>;
    /** The account's room and its settings, read without a lock before the draw (F-03.1). */
    readonly readOwnRoomSettings: (accountId: string) => Promise<OwnRoomSettings | undefined>;
    readonly readGuestRoomSettings?: (proof: GuestSessionProof) => Promise<OwnRoomSettings | undefined>;
  };
  /** The server's clock (`serverClock`), in integer milliseconds since the epoch. */
  readonly now: () => number;
  /** A monotonic clock for the leases (never the wall clock). */
  readonly monotonic: () => number;
  readonly schedule: Schedule;
  /** A room's race changed in the database (started, saved, interrupted): its members get a fresh snapshot. */
  readonly onGuestActivity?: (session: GuestSessionRow) => void;
  readonly onRoomChanged: (lobbyId: string) => void;
  /**
   * Where race texts come from: the corpus (CorpusTexts, F-02.3b), or the fixed test fixtures
   * (RACE_FIXTURE_TEXTS=allowed, local test builds only).
   */
  readonly texts: RaceTextSource;
  /**
   * New races may start (RACES_ENABLED=true, races-switch.ts). Otherwise every start is refused
   * here, before the database; races already running, rooms and results are not affected.
   */
  readonly racesOpen: boolean;
  /** A race of the room stopped here without a confirmed end (lost lease, unreachable database). */
  readonly onRaceLost?: (lobbyId: string) => void;
  readonly log: (message: string) => void;
  /** Failures; `log` when not given. */
  readonly logError?: (message: string) => void;
  readonly leaseTiming?: LeaseTiming;
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
  /** Account → its recent control requests: a change of control reaches all its tabs. */
  readonly #controlTimes = new Map<string, number[]>();
  /** Account → its recent « Je suis là » and abandons. */
  readonly #entrantActionTimes = new Map<string, number[]>();
  readonly #bonusLimiter: BonusActivationLimiter;
  readonly #starting = new Set<string>();

  constructor(options: RaceServiceOptions) {
    this.#options = options;
    this.#bonusLimiter = new BonusActivationLimiter(options.monotonic);
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
    const leaving = tabs?.get(connectionId);
    tabs?.delete(connectionId);
    // Windows expire rather than being deleted with the last tab: a reconnection never resets one.
    this.#prune(this.#batchTimes, BATCH_WINDOW_MS);
    this.#prune(this.#controlTimes, CONTROL_WINDOW.windowMs);
    this.#prune(this.#entrantActionTimes, ENTRANT_ACTION_WINDOW.windowMs);
    if (tabs?.size === 0) {
      this.#followers.delete(lobbyId);
    }
    if (leaving !== undefined) {
      this.#registry.get(lobbyId)?.unfollow(connectionId, leaving);
    }
  }

  /**
   * The host starts the race (COURSE-02/03) with the room's settings (F-03.1). The room, the host,
   * the settings revision and the participants are checked under the room lock, where the engine
   * creates the race (`createRace`, with its own checks); once that commits, this process runs it
   * under its lease (ADR-0004).
   */
  start(connection: RoomConnection & { readonly accountId: string }, payload: unknown): Promise<RaceStartAck> {
    return this.#startAsHuman(connection, payload);
  }

  startGuest(connection: RoomConnection & { readonly accountId: null }, proof: GuestSessionProof, payload: unknown): Promise<RaceStartAck> {
    return this.#startAsHuman({ ...connection, guestProof: proof }, payload);
  }

  async #startAsHuman(connection: StartConnection, payload: unknown): Promise<RaceStartAck> {
    if (!raceStartPayloadSchema.safeParse(payload).success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    if (this.#registry.stopping) {
      return { ok: false, error: "UNAVAILABLE" };
    }
    // The one way a race is created, the next round's start included: closed means none.
    if (!this.#options.racesOpen) {
      return { ok: false, error: "RACES_CLOSED" };
    }
    const identity = raceConnectionKey(connection);
    this.#prune(this.#startTimes, START_WINDOW.windowMs);
    if (!this.#withinWindow(this.#startTimes, identity, START_WINDOW.maxStarts, START_WINDOW.windowMs)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    // One start in flight per account; the database refuses a second start of the room anyway.
    if (this.#starting.has(identity)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    this.#starting.add(identity);
    try {
      for (let draw = 1; draw <= START_DRAWS; draw += 1) {
        const answer = await this.#drawAndStart(connection);
        if (answer !== "SETTINGS_CHANGED") {
          return answer;
        }
      }
      // Saved again during the second draw: a second tab of the host changing them in a loop.
      this.#logError("[races] start refused: the room settings changed during each draw");
      return { ok: false, error: "UNAVAILABLE" };
    } finally {
      this.#starting.delete(identity);
    }
  }

  /** One draw with the room's current settings, then the start transaction. */
  async #drawAndStart(connection: StartConnection): Promise<RaceStartAck | "SETTINGS_CHANGED"> {
    let room: OwnRoomSettings | undefined;
    try {
      room = connection.accountId === null
        ? await this.#options.store.readGuestRoomSettings?.(connection.guestProof)
        : await this.#options.store.readOwnRoomSettings(connection.accountId);
    } catch (error: unknown) {
      this.#logError(`[races] start failed: ${describeDatabaseError(error)}`);
      return { ok: false, error: "UNAVAILABLE" };
    }
    // Checked again under the room lock; refused here, a start that cannot go on reads no corpus.
    if (room === undefined) {
      return { ok: false, error: "NOT_IN_A_ROOM" };
    }
    if (!room.isHost) {
      return { ok: false, error: "NOT_HOST" };
    }
    if (room.phase !== "waiting") {
      return { ok: false, error: "ROOM_NOT_WAITING" };
    }
    const { settings } = room;
    // Only the host's action writes settings, within these bounds: anything else was written by hand.
    if (!isRunnable(settings)) {
      this.#logError(`[races] start refused: room ${room.lobbyId} has settings races do not run yet`);
      return { ok: false, error: "UNAVAILABLE" };
    }
    // The text's language is the room's (CONF-02), then the race's for good.
    const drawn = await this.#options.texts.draw(settings.textLanguage, settings.wordCount);
    // Refused before any write: no race is written, the room stays as it was.
    if (!drawn.ok) {
      return { ok: false, error: drawn.reason };
    }
    // The draw may have waited for the corpus while the process began stopping.
    if (this.#registry.stopping) {
      return { ok: false, error: "UNAVAILABLE" };
    }
    return this.#start(connection, drawn, room.lobbyId, settings);
  }

  async #start(
    connection: StartConnection,
    { text, record }: Extract<RaceTextDraw, { ok: true }>,
    lobbyId: string,
    settings: OwnRoomSettings["settings"],
  ): Promise<RaceStartAck | "SETTINGS_CHANGED"> {
    const { store, ownerId } = this.#options;
    const { revision, timeLimitMs, errorMode } = settings;
    const timeLimit = timeLimitMs === null ? null : asDuration(timeLimitMs);
    const acquiredAt = this.#options.monotonic();
    let started: StartRaceResult<CreateRaceRefusal, BonusRaceState>;
    try {
      started = await store.startRace({
        ...(connection.accountId === null
          ? { accountId: null, guestProof: connection.guestProof }
          : { accountId: connection.accountId }),
        ownerId,
        text,
        config: { errorMode, timeLimitMs, wordCount: settings.wordCount, ...record, bonuses: false },
        lobbyId,
        settingsRevision: revision,
        rulesVersion: RULES_VERSION,
        // Under the room lock: a refusal changes nothing, an exception rolls the start back.
        create: ({ raceId, entrants }) => {
          const input = {
            raceId: asRaceId(raceId),
            text,
            errorMode,
            timeLimit,
            participants: entrants.map(({ entrantId, kind }) => ({ entrantId: asEntrantId(entrantId), kind })),
            now: asInstant(this.#options.now()),
          };
          const refusal = createRaceRefusal(input);
          if (refusal !== undefined) return { ok: false, reason: refusal };
          const result = createBonusRace({ enabled: false, random: [1, 2, 3, 4], race: input });
          // Disabled until room configuration and approved content land in 62B. This dormant
          // stream is not used for draws or security; enabled races must receive a private seed.
          if (!result.ok) throw new RangeError(result.reason);
          return { ok: true, race: result.state };
        },
      });
    } catch (error: unknown) {
      this.#logError(`[races] start failed: ${describeDatabaseError(error)}`);
      return { ok: false, error: "UNAVAILABLE" };
    }
    if (!started.ok) {
      const { error } = started;
      if (error === "SETTINGS_CHANGED") {
        return error;
      }
      if (error === "NOT_IN_A_ROOM" || error === "NOT_HOST" || error === "ROOM_NOT_WAITING" || error === "NOT_ENOUGH_PARTICIPANTS" || error === "NO_HUMAN_PARTICIPANT") {
        return { ok: false, error };
      }
      // The text and the settings are the server's: any other refusal is a bug here.
      this.#logError(`[races] start refused by the engine: ${error}`);
      return { ok: false, error: "UNAVAILABLE" };
    }
    if (started.guestSession !== undefined) this.#options.onGuestActivity?.(started.guestSession);
    const ownership: RaceOwnership = started.race;
    const runtime = this.#runtime({ ownership, state: started.created, entrants: started.entrants, acquiredAt, language: record.language });
    if (!this.#registry.add(runtime)) {
      // The process began stopping during the start.
      await this.#interrupt(ownership, "server_stopped");
      return { ok: false, error: "UNAVAILABLE" };
    }
    runtime.start();
    this.#options.onRoomChanged(ownership.lobbyId);
    return { ok: true };
  }

  #runtime({
    ownership,
    state,
    entrants,
    acquiredAt,
    language,
  }: {
    readonly ownership: RaceOwnership;
    readonly state: BonusRaceState;
    readonly entrants: readonly import("./race-runtime").RaceEntrant[];
    readonly acquiredAt: number;
    readonly language: Locale;
  }): RaceRuntime {
    const { store, schedule, log } = this.#options;
    let failing = false;
    const lease = new RaceLease({
      renew: async () => {
        try {
          const renewed = (await store.renewRaceLease(ownership)).renewed;
          failing = false;
          return renewed;
        } catch (error: unknown) {
          // Logged once per outage; the lease retries every 2 s and suspends on time.
          if (!failing) {
            this.#logError(`[races] lease renewal of ${ownership.raceId} failed: ${describeDatabaseError(error)}`);
          }
          failing = true;
          throw error;
        }
      },
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
      language,
      store,
      lease,
      now: this.#options.now,
      schedule,
      followers: () => this.#followers.get(ownership.lobbyId)?.values() ?? [],
      onSettled: (settled, outcome) => {
        this.#registry.remove(settled);
        this.#options.onRoomChanged(settled.lobbyId);
        if (outcome === "lost") {
          // Not run here any more, and the database may not hold its end yet: the room is
          // watched until it does (its lease ends, then recovery), so open pages learn it.
          this.#options.onRaceLost?.(settled.lobbyId);
        }
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
    if (!this.#withinWindow(this.#batchTimes, raceConnectionKey(connection), MAX_BATCHES_PER_SECOND, BATCH_WINDOW_MS)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    const parsed = parseKeystrokeBatch(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    const followed = this.#followed(connection);
    return followed === undefined ? { ok: false, error: "NO_RACE" } : followed.runtime.keystrokes(followed.connection, parsed.data);
  }

  /** Five attempts per second per authenticated account, shared across tabs and reconnects. */
  activateBonus(connection: RoomConnection, payload: unknown): BonusActivationAck {
    const followed = this.#followed(connection);
    if (followed === undefined) return { ok: false, error: "NO_RACE" };
    if (!this.#bonusLimiter.allow(raceConnectionKey(connection))) return { ok: false, error: "RATE_LIMITED" };
    const parsed = bonusActivationPayloadSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: "INVALID_PAYLOAD" };
    return followed.runtime.activateBonus(followed.connection, parsed.data);
  }

  /** A second tab asks for the input (state-machines §2). */
  takeControl(connection: RoomConnection, payload: unknown): RaceControlAck {
    const parsed = raceControlPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    // Per account as well as per socket: many tabs taking the input in turn would multiply the
    // state sent to every one of them.
    if (!this.#withinWindow(this.#controlTimes, raceConnectionKey(connection), CONTROL_WINDOW.maxRequests, CONTROL_WINDOW.windowMs)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    const followed = this.#followed(connection);
    if (followed === undefined || followed.runtime.ownership.raceId !== parsed.data.raceId) {
      return { ok: false, error: "NO_RACE" };
    }
    const answer = followed.runtime.takeControl(followed.connection);
    return answer === "ok" ? { ok: true } : { ok: false, error: answer };
  }

  /** « Je suis là » (D-17), from a tab of the entrant. */
  present(connection: RoomConnection, payload: unknown): RaceEntrantActionAck {
    return this.#entrantAction(connection, payload, (runtime, followed) => runtime.present(followed));
  }

  /** The entrant gives the race up, confirmed in its page (COURSE-07). */
  abandon(connection: RoomConnection, payload: unknown): RaceEntrantActionAck {
    return this.#entrantAction(connection, payload, (runtime, followed) => runtime.abandon(followed));
  }

  #entrantAction(
    connection: RoomConnection,
    payload: unknown,
    act: (runtime: RaceRuntime, followed: RoomConnection) => "ok" | "NOT_AN_ENTRANT" | "NO_RACE" | "SUSPENDED",
  ): RaceEntrantActionAck {
    const parsed = raceEntrantActionPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }
    if (!this.#withinWindow(this.#entrantActionTimes, raceConnectionKey(connection), ENTRANT_ACTION_WINDOW.maxRequests, ENTRANT_ACTION_WINDOW.windowMs)) {
      return { ok: false, error: "RATE_LIMITED" };
    }
    const followed = this.#followed(connection);
    if (followed === undefined || followed.runtime.ownership.raceId !== parsed.data.raceId) {
      return { ok: false, error: "NO_RACE" };
    }
    const answer = act(followed.runtime, followed.connection);
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

  roomClosed(lobbyId: string): void {
    this.#registry.get(lobbyId)?.roomClosed();
  }

  /** Server-committed guest departure, addressed by live membership only. */
  guestMemberLeft(lobbyId: string, memberId: string): void {
    this.#registry.get(lobbyId)?.guestMemberLeft(memberId);
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

  /** Drops the windows with nothing left in them, so the map holds only recent accounts. */
  #prune(windows: Map<string, number[]>, windowMs: number): void {
    const now = this.#options.monotonic();
    for (const [key, times] of windows) {
      if (times.every((time) => now - time >= windowMs)) {
        windows.delete(key);
      }
    }
  }

  #logError(message: string): void {
    (this.#options.logError ?? this.#options.log)(message);
  }

  /**
   * The tab as the room channel admitted it (with its page id), and its room's race; only for
   * the same session's account.
   */
  #followed(connection: RoomConnection): { readonly runtime: RaceRuntime; readonly connection: RoomConnection } | undefined {
    const lobbyId = this.#rooms.get(connection.id);
    const followed = lobbyId === undefined ? undefined : this.#followers.get(lobbyId)?.get(connection.id);
    const runtime = lobbyId === undefined ? undefined : this.#registry.get(lobbyId);
    return followed === undefined || runtime === undefined || raceConnectionKey(followed) !== raceConnectionKey(connection) ? undefined : { runtime, connection: followed };
  }
}

/**
 * The server's clock for races: milliseconds since the epoch that never go backwards within the
 * process (the engine's `Instant`), whatever the wall clock does meanwhile.
 */
export function serverClock(): number {
  return Math.floor(performance.timeOrigin + performance.now());
}
