import { describeDatabaseError, keyErrorsFromEngine, type Interruption, type RaceOwnership, type RaceResultRow, type Transition } from "@incision/database";
import {
  asEntrantId,
  asInstant,
  asRaceId,
  INITIAL_WPM_SERIES_SPACING_MS,
  type StoredWpmSeries,
  type EntrantId,
  type EntrantResult,
  type EntrantState,
  type RaceEnd,
  type RaceEvent,
  type RaceOutput,
  type RaceState,
  reduceBonusRace,
  availableBonusGrants,
  type BonusRaceState,
  type BonusRaceEvent,
  type BonusRaceOutput,
  type BonusContent,
  toEntrantMeasures,
  toEntrantSnapshot,
  toRaceBroadcast,
  toRaceReveal,
} from "@incision/domain";
import type { Locale } from "../../i18n/locale";
import { RACE_BONUS_ANNOUNCEMENT_EVENT, RACE_BONUS_SELF_EVENT, type BonusActivationPayload, type BonusActivationAck, type BonusSelf } from "../../races/bonus-protocol";
import type { KeystrokeBatchPayload, RaceBatchAck, RaceProgressPayload, RaceRevealPayload, RaceSelfPayload } from "../../races/protocol";
import { RACE_CONFIRMING_EVENT, RACE_PROGRESS_EVENT, RACE_REVEAL_EVENT, RACE_SELF_EVENT } from "../../races/protocol";
import type { LeaseState, Schedule } from "./race-lease";
import type { OwnedRace, ShutdownOutcome } from "./race-registry";
import { RaceWpmSeries } from "./race-wpm-series";

/** One open tab following the room, as the room channel admitted it (session checked, member of the room). */
export type RaceConnection = {
  readonly id: string;
  readonly accountId: string;
  /**
   * The page this socket belongs to, kept by the page across its reconnections; a page that
   * reconnects takes the input back from its own former socket even before the server has
   * seen that socket close. Only ever compared within one entrant's own tabs.
   */
  readonly pageId?: string;
  /**
   * `volatile`: may be dropped when the tab is not ready to receive (Socket.IO's volatile), for
   * messages the next one replaces anyway (progress, another tab's typing), so a tab that does
   * not read cannot pile them up on the server.
   */
  readonly emit: (event: string, payload: unknown, options?: { readonly volatile?: boolean }) => void;
};

export type RaceEntrant = {
  readonly entrantId: string;
  readonly accountId: string;
  readonly displayName: string;
};

/** The fenced writes of ADR-0004 (`@incision/database`), for this race's owner and generation. */
export type RaceStore = {
  readonly beginRacing: (ownership: RaceOwnership) => Promise<Transition>;
  readonly finalizeRace: (ownership: RaceOwnership, results: readonly RaceResultRow[]) => Promise<Transition>;
  readonly interruptOwnRace: (ownership: RaceOwnership, reason: "server_stopped" | "save_failed" | "engine_error") => Promise<Interruption>;
};

/** What the runtime needs of its lease (`RaceLease`). */
export type LeaseView = {
  readonly start: () => void;
  readonly stop: () => void;
  readonly isAuthoritative: () => boolean;
  readonly state: LeaseState;
  /** While suspended, how long ago the deadline that passed, on the lease's own clock (D-17). */
  readonly suspendedForMs: () => number | undefined;
};

/** D-17: inactivity stops while the lease is suspended, since nobody can answer (ADR-0004). */
type LeaseEvent = Extract<RaceEvent, { readonly type: "inactivityPaused" | "inactivityResumed" }>;

export type RaceRuntimeOptions = {
  readonly ownership: RaceOwnership;
  readonly state: BonusRaceState;
  /** Trusted, pure approved-content provider; absent means append is unavailable, never a fallback. */
  readonly bonusContent?: BonusContent;
  readonly entrants: readonly RaceEntrant[];
  /** The language of the race's text (the host's at the start, D-19), for the pages to mark it. */
  readonly language: Locale;
  readonly store: RaceStore;
  /** Built by the caller with `onChange` wired to `leaseChanged`. */
  readonly lease: LeaseView;
  /** The server's clock, in integer milliseconds since the epoch, never going backwards. */
  readonly now: () => number;
  readonly schedule: Schedule;
  /** The room's tabs, read when the race needs them. */
  readonly followers: () => Iterable<RaceConnection>;
  /** The race ended here (saved, interrupted, or its ownership lost): the room's members get a fresh snapshot. */
  readonly onSettled: (ownership: RaceOwnership, outcome: "saved" | "interrupted" | "lost") => void;
  readonly log: (message: string) => void;
  /** Failures (writes that failed, an engine fault); `log` when not given. */
  readonly logError?: (message: string) => void;
  readonly timing?: Partial<RuntimeTiming>;
};

export type RuntimeTiming = {
  /** COURSE-05 and F-04.4: everyone's progress at most four times a second. */
  readonly progressEveryMs: number;
  /** Waits before each retry of a write that failed, never periodic (ADR-0004). */
  readonly saveRetriesMs: readonly number[];
  readonly interruptRetriesMs: readonly number[];
  /** After the typing tab closed: the same page may come back before another tab takes over. */
  readonly handoverGraceMs: number;
};

const TIMING: RuntimeTiming = {
  progressEveryMs: 250,
  saveRetriesMs: [1_000, 2_000, 4_000, 8_000],
  interruptRetriesMs: [1_000, 2_000],
  handoverGraceMs: 3_000,
};

/**
 * How far the race got here. `running`: the engine decides. `saving`: the results are frozen
 * and kept until a transaction confirms them. `failing`: the engine failed and the
 * interruption is being written. `stopping`: the process stops. The others are terminal:
 * nothing is accepted any more, and no answer that arrives late changes them.
 */
type Stage = "running" | "saving" | "failing" | "stopping" | "saved" | "interrupted" | "lost";

/**
 * One race this process runs (F-04.0, ADR-0004): the engine's state in memory, its due
 * transitions from `nextDeadline`, the keystroke batches of each entrant's controlling tab, the
 * progress broadcasts, and the fenced writes. Every rule of the race is the engine's
 * (`reduceRace`); nothing here decides a position, a measure or a rank. No game delay, network
 * exchange or wait for a player happens inside an SQL transaction: each write is one bounded
 * transaction (`boundedTransaction`), started once the engine has decided.
 */
export class RaceRuntime implements OwnedRace {
  readonly ownership: RaceOwnership;
  readonly #options: RaceRuntimeOptions;
  readonly #timing: RuntimeTiming;
  readonly #entrants: ReadonlyMap<string, RaceEntrant>;
  #bonus: BonusRaceState;
  get #state(): RaceState { return this.#bonus.race; }
  #stage: Stage = "running";
  /** Frozen at the end and sent unchanged by every attempt, until one is confirmed. */
  #results: readonly RaceResultRow[] | undefined;
  /** Entrant id → the tab that types for it, and its page. */
  readonly #control = new Map<string, { readonly connectionId: string; readonly pageId: string | undefined }>();
  /**
   * Entrant id → its input, freed when its typing tab closed: reserved for that tab's page for a
   * short grace (a network blip), then handed to another open tab. `cancel` stops the hand-over.
   */
  readonly #vacated = new Map<string, { readonly pageId: string | undefined; readonly cancel: () => void }>();
  /**
   * Entrants none of whose tabs follows the room, as the engine was told (D-06): their grace runs
   * from the server's detection of the loss, and a tab of theirs that follows again resumes them.
   */
  readonly #lost = new Set<string>();
  /**
   * The pauses and resumes of inactivity, in the order the lease changed. The lease reports a
   * change from inside a read, possibly within a reduction: they wait here, and are reduced before
   * the next event (`#applyBonus`), or by a tick of their own (`#cancelDrain`).
   */
  readonly #leaseEvents: LeaseEvent[] = [];
  #cancelDrain: (() => void) | undefined;
  #cancelTick: (() => void) | undefined;
  readonly #wpm = new RaceWpmSeries();
  #cancelWpm: (() => void) | undefined;
  #wpmDeadline: number | undefined;
  #cancelProgress: (() => void) | undefined;
  #progressSentAt = Number.NEGATIVE_INFINITY;
  #beginWritten = false;
  #saving: Promise<void> | undefined;

  constructor(options: RaceRuntimeOptions) {
    this.#options = options;
    this.ownership = options.ownership;
    this.#bonus = options.state;
    this.#timing = { ...TIMING, ...options.timing };
    this.#entrants = new Map(options.entrants.map((entrant) => [entrant.entrantId, entrant]));
  }

  get lease(): { readonly stop: () => void } {
    return this.#options.lease;
  }

  /** The race this runtime holds, for tests and logs; never sent as is. */
  get state(): RaceState {
    return this.#state;
  }

  get stage(): Stage {
    return this.#stage;
  }

  /**
   * Starts the renewals, reveals the race to the room and schedules its first transition. An
   * entrant with no tab following the room at the start is already gone: its grace starts now.
   */
  start(): void {
    this.#options.lease.start();
    for (const connection of this.#options.followers()) {
      this.follow(connection);
    }
    this.#apply({ type: "tick", now: this.#now() });
    for (const entrant of this.#entrants.values()) {
      if (!this.#hasTab(entrant.accountId)) {
        this.#connectionLost(entrant.entrantId);
      }
    }
  }

  /** A tab of the room (re)opened: it gets the race, and the input if its entrant has no typing tab. */
  follow(connection: RaceConnection): void {
    if (this.#stage !== "running" && this.#stage !== "saving") {
      return;
    }
    const entrant = this.#entrantOf(connection.accountId);
    if (entrant !== undefined && this.#lost.delete(entrant.entrantId)) {
      // Before any batch of this tab, which can only come once it follows (D-06).
      this.#apply({ type: "connectionResumed", entrantId: asEntrantId(entrant.entrantId), now: this.#now() });
    }
    if (entrant !== undefined && (this.#free(entrant.entrantId, connection) || this.#samePage(entrant.entrantId, connection))) {
      // No typing tab, or this page reconnected: its former socket's late batches are discarded.
      this.#control.set(entrant.entrantId, { connectionId: connection.id, pageId: connection.pageId });
      this.#cancelHandover(entrant.entrantId);
    }
    const reveal = this.#revealFor(entrant?.entrantId);
    const progress = this.#progress();
    const self = entrant === undefined ? undefined : this.#selfFor(entrant.entrantId, connection.id);
    if (reveal === undefined || progress === undefined || (entrant !== undefined && self === undefined)) {
      return;
    }
    connection.emit(RACE_REVEAL_EVENT, reveal);
    connection.emit(RACE_PROGRESS_EVENT, progress);
    if (self !== undefined) {
      connection.emit(RACE_SELF_EVENT, self);
      connection.emit(RACE_BONUS_SELF_EVENT, this.#bonusSelf(entrant!.entrantId));
    }
    if (this.#stage === "saving") {
      connection.emit(RACE_CONFIRMING_EVENT, { raceId: this.ownership.raceId });
    }
  }

  /**
   * A tab closed or left the room (`accountId`: its session's account). If it typed, its input
   * waits a short grace for that tab's page to come back (a network blip); then the entrant's
   * most recent other open tab takes it and learns it (state-machines §2). If it was the
   * entrant's last tab, the engine learns the loss now, at the server's detection (D-06).
   */
  unfollow(connectionId: string, accountId: string): void {
    const entrant = this.#entrantOf(accountId);
    if (entrant !== undefined && !this.#hasTab(entrant.accountId)) {
      this.#connectionLost(entrant.entrantId);
    }
    for (const [entrantId, controller] of this.#control) {
      if (controller.connectionId !== connectionId) {
        continue;
      }
      this.#control.delete(entrantId);
      this.#cancelHandover(entrantId);
      const cancel = this.#options.schedule(() => {
        this.#vacated.delete(entrantId);
        this.#handOver(entrantId);
      }, this.#timing.handoverGraceMs);
      this.#vacated.set(entrantId, { pageId: controller.pageId, cancel });
    }
  }

  #handOver(entrantId: string): void {
    if (this.#control.has(entrantId) || (this.#stage !== "running" && this.#stage !== "saving")) {
      return;
    }
    const entrant = this.#entrants.get(entrantId);
    const next = entrant === undefined ? undefined : [...this.#connectionsOf(entrant.accountId)].at(-1);
    if (next === undefined) {
      return;
    }
    this.#control.set(entrantId, { connectionId: next.id, pageId: next.pageId });
    const self = this.#selfFor(entrantId, next.id);
    if (self !== undefined) {
      next.emit(RACE_SELF_EVENT, self);
    }
  }

  #cancelHandover(entrantId: string): void {
    this.#vacated.get(entrantId)?.cancel();
    this.#vacated.delete(entrantId);
  }

  /**
   * Whether this tab may take the entrant's input on following: nobody types, and during the
   * grace only the page that typed (or anyone, if that page had no id).
   */
  #free(entrantId: string, connection: RaceConnection): boolean {
    if (this.#controllerFollows(entrantId)) {
      return false;
    }
    const vacated = this.#vacated.get(entrantId);
    return vacated === undefined || vacated.pageId === undefined || vacated.pageId === connection.pageId;
  }

  /** The input moves to this tab; the previous one observes, and its late batches are discarded. */
  takeControl(connection: RaceConnection): "ok" | "NOT_AN_ENTRANT" | "NO_RACE" {
    if (this.#stage !== "running") {
      return "NO_RACE";
    }
    const entrant = this.#entrantOf(connection.accountId);
    if (entrant === undefined) {
      return "NOT_AN_ENTRANT";
    }
    if (this.#control.get(entrant.entrantId)?.connectionId === connection.id) {
      // Already this tab's: it gets its state again (it may have missed it), the others nothing.
      const self = this.#selfFor(entrant.entrantId, connection.id);
      if (self !== undefined) {
        connection.emit(RACE_SELF_EVENT, self);
      }
      return "ok";
    }
    this.#control.set(entrant.entrantId, { connectionId: connection.id, pageId: connection.pageId });
    this.#cancelHandover(entrant.entrantId);
    // A change of control must arrive: never volatile.
    this.#sendSelf(entrant.entrantId, { volatile: false });
    return this.#stage === "running" ? "ok" : "NO_RACE";
  }

  /**
   * One batch from a tab (F-04.4): only the entrant's controlling tab, only while this process
   * can prove it owns the race, and the engine judges the rest. The entrant comes from the
   * session's account, never from the payload.
   */
  keystrokes(connection: RaceConnection, payload: KeystrokeBatchPayload): RaceBatchAck {
    const entrant = this.#entrantOf(connection.accountId);
    if (entrant === undefined) {
      return { ok: false, error: "NOT_AN_ENTRANT" };
    }
    if (this.#stage !== "running" && this.#stage !== "saving") {
      return { ok: false, error: "NO_RACE" };
    }
    if (this.#control.get(entrant.entrantId)?.connectionId !== connection.id) {
      return { ok: false, error: "NOT_CONTROLLING" };
    }
    if (!this.#options.lease.isAuthoritative()) {
      return { ok: false, error: "SUSPENDED" };
    }
    const output = this.#apply(
      {
        type: "keystrokes",
        now: this.#now(),
        batch: { raceId: asRaceId(payload.raceId), entrantId: asEntrantId(entrant.entrantId), seq: payload.seq, textVersion: payload.textVersion, events: payload.events },
      },
      connection.id,
    );
    const self = output?.keystrokes === undefined ? undefined : this.#selfFor(entrant.entrantId, connection.id);
    if (output?.keystrokes === undefined || self === undefined) {
      return { ok: false, error: "NO_RACE" };
    }
    // The other tabs of this entrant follow its typing while it races: the next batch replaces
    // it. An entrant this batch (or a deadline before it) ended was told reliably by `#apply`.
    if (output.keystrokes.outcome === "applied" && self.snapshot.status === "racing") {
      this.#sendSelf(entrant.entrantId, { except: connection.id, volatile: true });
    }
    return { ok: true, result: output.keystrokes, self };
  }

  /** Authenticated controlling tab only; one synchronous coordinator transition, no SQL or await. */
  activateBonus(connection: RaceConnection, payload: BonusActivationPayload): BonusActivationAck {
    const entrant = this.#entrantOf(connection.accountId);
    if (entrant === undefined) return { ok: false, error: "NOT_AN_ENTRANT" };
    if ((this.#stage !== "running" && this.#stage !== "saving") || payload.raceId !== this.ownership.raceId) return { ok: false, error: "NO_RACE" };
    if (this.#control.get(entrant.entrantId)?.connectionId !== connection.id) return { ok: false, error: "NOT_CONTROLLING" };
    if (!this.#options.lease.isAuthoritative()) return { ok: false, error: "SUSPENDED" };
    const output = this.#applyBonus({ type: "activate", raceId: asRaceId(payload.raceId), entrantId: asEntrantId(entrant.entrantId),
      milestone: payload.milestone, seq: payload.seq, now: this.#now() });
    if (output?.activation === undefined) return { ok: false, error: "NO_RACE" };
    return { ok: true, result: output.activation, self: this.#bonusSelf(entrant.entrantId) };
  }

  #bonusSelf(entrantId: string): BonusSelf {
    const fog = this.#bonus.fog.find((item) => item.entrantId === entrantId);
    return { raceId: this.ownership.raceId, revision: this.#bonus.revision, enabled: this.#bonus.awards.enabled,
      ackSeq: this.#bonus.cursors.find((item) => item.entrantId === entrantId)?.seq ?? 0,
      grants: availableBonusGrants(this.#bonus, asEntrantId(entrantId)).map(({ milestone, kind }) => ({ milestone, kind })),
      fog: fog === undefined ? null : { startsAt: fog.startsAt, expiresAt: fog.expiresAt } };
  }

  /**
   * « Je suis là » (D-17), from any tab of the entrant: activity for the engine. Like a batch,
   * only while this process can prove it owns the race.
   */
  present(connection: RaceConnection): "ok" | "NOT_AN_ENTRANT" | "NO_RACE" | "SUSPENDED" {
    return this.#entrantAction(connection, (entrantId) => ({ type: "present", entrantId, now: this.#now() }));
  }

  /**
   * The entrant gives the race up, confirmed in its page (COURSE-07): terminal, ranked by its
   * progress. Every tab of the entrant learns its new status at once (`#tellEnded`); an entrant
   * already terminal changes nothing and is told nothing.
   */
  abandon(connection: RaceConnection): "ok" | "NOT_AN_ENTRANT" | "NO_RACE" | "SUSPENDED" {
    return this.#entrantAction(connection, (entrantId) => ({ type: "abandon", entrantId, now: this.#now() }));
  }

  #entrantAction(
    connection: RaceConnection,
    event: (entrantId: EntrantId) => RaceEvent,
  ): "ok" | "NOT_AN_ENTRANT" | "NO_RACE" | "SUSPENDED" {
    const entrant = this.#entrantOf(connection.accountId);
    if (entrant === undefined) {
      return "NOT_AN_ENTRANT";
    }
    if (this.#stage !== "running") {
      return "NO_RACE";
    }
    if (!this.#options.lease.isAuthoritative()) {
      return "SUSPENDED";
    }
    // The engine ignores what no longer applies (an entrant already terminal, a race over).
    return this.#apply(event(asEntrantId(entrant.entrantId))) === undefined ? "NO_RACE" : "ok";
  }

  #connectionLost(entrantId: string): void {
    if (!this.#lost.has(entrantId)) {
      this.#lost.add(entrantId);
      this.#apply({ type: "connectionLost", entrantId: asEntrantId(entrantId), now: this.#now() });
    }
  }

  /** The member left the room during the race: an immediate abandon (state-machines §3). */
  memberLeft(accountId: string): void {
    const entrant = this.#entrantOf(accountId);
    if (entrant !== undefined && this.#stage === "running") {
      this.#apply({ type: "abandon", entrantId: asEntrantId(entrant.entrantId), now: this.#now() });
    }
  }

  /**
   * The room closed (the host left): its transaction already interrupted the race under the
   * room lock, unless this race had finished first. In memory, the race ends without results.
   */
  roomClosed(): void {
    if (this.#stage === "running") {
      this.#apply({ type: "interrupt", now: this.#now() });
      this.#settle("interrupted");
    }
  }

  /**
   * A newer race of the room started here: this one is no longer the room's current race (the
   * committed start proves it). It stops for good, its timers and renewals included.
   */
  retire(): void {
    this.#settle("lost");
  }

  /**
   * The lease's view changed (ADR-0004). A lost lease never comes back: the race ended elsewhere.
   * Suspended, then held again: inactivity pauses, then resumes (D-17), queued, never reduced here.
   */
  leaseChanged(state: LeaseState): void {
    if (state === "suspended" && this.#stage === "running") {
      this.#queueLeaseEvent(this.#pause());
    } else if (state === "lost" && this.#stage === "saving") {
      // The save in flight decides: it commits (or an earlier one did, `alreadyDone`) or it loses.
      this.#options.log(`[races] ownership of ${this.ownership.raceId} lost while its results are being saved`);
    } else if (state === "lost" && this.#stage === "running") {
      this.#options.log(`[races] ownership of ${this.ownership.raceId} lost: the race stops here`);
      this.#settle("lost");
    } else if (state === "held" && this.#stage === "running") {
      // Dated now, not when reduced: the wait until then is time the runners can answer.
      this.#queueLeaseEvent({ type: "inactivityResumed", now: this.#now() });
      // Broadcasts held back while the lease was suspended go out now.
      this.#scheduleProgress();
      for (const entrant of this.#entrants.values()) {
        this.#sendSelf(entrant.entrantId, { volatile: false });
        for (const connection of this.#connectionsOf(entrant.accountId)) connection.emit(RACE_BONUS_SELF_EVENT, this.#bonusSelf(entrant.entrantId));
      }
    }
  }

  /**
   * Inactivity stops at the deadline that passed, read on the lease's clock and brought to the
   * engine's in the same step: rounded up, so never after that deadline, and about 1 ms before at
   * most (the two clocks are read a few microseconds apart).
   * The event itself is dated when the suspension is noticed: the WPM series may already hold a
   * sample past `since`, and a reduction never moves back before one.
   */
  #pause(): LeaseEvent {
    const now = this.#now();
    // `RaceLease` always dates a suspension; a lease that cannot pauses from now.
    const since = asInstant(now - Math.ceil(this.#options.lease.suspendedForMs() ?? 0));
    return { type: "inactivityPaused", since, now };
  }

  /**
   * Queues a pause or a resume. The next event reduces it first; otherwise a tick of its own does,
   * as soon as the timers allow. A non-empty queue always has that tick pending.
   */
  #queueLeaseEvent(event: LeaseEvent): void {
    this.#leaseEvents.push(event);
    if (this.#cancelDrain !== undefined) {
      return;
    }
    this.#cancelDrain = this.#options.schedule(() => {
      this.#cancelDrain = undefined;
      if (this.#leaseEvents.length > 0) {
        this.#apply({ type: "tick", now: this.#now() });
      }
    }, 0);
  }

  /**
   * The process stops (SIGTERM), within `deadline` on the server's clock. Frozen results get
   * one attempt to be saved while the ownership holds; otherwise the race is interrupted
   * (`server_stopped`). A race whose results committed is never interrupted. Past the deadline,
   * or when the database does not answer, the race is left to its lease, which another process
   * recovers.
   */
  async shutdown(deadline = Number.POSITIVE_INFINITY): Promise<ShutdownOutcome> {
    if (this.#stage === "saved") {
      return "finalised";
    }
    if (this.#stage === "interrupted") {
      return "interrupted";
    }
    if (this.#stage === "lost" || this.#stage === "stopping" || this.#stage === "failing") {
      // A failed engine's interruption is already being written; the lease covers the rest.
      return "left";
    }
    const results = this.#results;
    this.#stage = "stopping";
    this.#clearTimers();
    const ownership = this.ownership;
    if (results !== undefined && this.#options.lease.state !== "lost") {
      const saved = await this.#withinDeadline(() => this.#options.store.finalizeRace(ownership, results), deadline);
      if (saved?.won === true) {
        return "finalised";
      }
      if (saved?.won === false) {
        // Someone else ended the race (a takeover): nothing of ours to publish.
        return "left";
      }
    }
    const stopped = await this.#withinDeadline(() => this.#options.store.interruptOwnRace(ownership, "server_stopped"), deadline);
    if (stopped === undefined) {
      return "left";
    }
    if (stopped.won) {
      return "interrupted";
    }
    return stopped.resultsSaved ? "finalised" : "left";
  }

  #now() {
    return asInstant(this.#options.now());
  }

  #entrantOf(accountId: string): RaceEntrant | undefined {
    for (const entrant of this.#entrants.values()) {
      if (entrant.accountId === accountId) {
        return entrant;
      }
    }
    return undefined;
  }

  #hasTab(accountId: string): boolean {
    for (const _ of this.#connectionsOf(accountId)) {
      return true;
    }
    return false;
  }

  *#connectionsOf(accountId: string): Iterable<RaceConnection> {
    for (const connection of this.#options.followers()) {
      if (connection.accountId === accountId) {
        yield connection;
      }
    }
  }

  #controllerFollows(entrantId: string): boolean {
    const controller = this.#control.get(entrantId);
    if (controller === undefined) {
      return false;
    }
    for (const connection of this.#options.followers()) {
      if (connection.id === controller.connectionId) {
        return true;
      }
    }
    return false;
  }

  /** The typing tab's page is this connection's page: the same page, reconnected. */
  #samePage(entrantId: string, connection: RaceConnection): boolean {
    const controller = this.#control.get(entrantId);
    return controller !== undefined && controller.pageId !== undefined && controller.pageId === connection.pageId && controller.connectionId !== connection.id;
  }

  /**
   * Hands one event to the engine. An unexpected exception there ends this race only: the last
   * good state is interrupted in memory and in the database (`engine_error`). `answered`: the tab
   * whose request this is, which gets its state in its answer.
   */
  #apply(event: RaceEvent, answered?: string): RaceOutput | undefined {
    return this.#applyBonus(event, answered)?.raceOutput;
  }

  /**
   * Reads the lease first, which notices a deadline that passed: the pause it queues, and any
   * pause or resume already queued, are reduced in order before this event (D-17).
   */
  #applyBonus(event: BonusRaceEvent, answered?: string): BonusRaceOutput | undefined {
    // Read for its effect only: a deadline that passed is noticed here, and its pause queued.
    this.#options.lease.isAuthoritative();
    for (let queued = this.#leaseEvents.shift(); queued !== undefined; queued = this.#leaseEvents.shift()) {
      this.#reduce(queued);
    }
    return this.#reduce(event, answered);
  }

  /** Reduces one event. Only `#applyBonus` calls it, after the lease read and the queue. */
  #reduce(event: BonusRaceEvent, answered?: string): BonusRaceOutput | undefined {
    if (this.#stage !== "running" && !(this.#stage === "saving" && (event.type === "keystrokes" || event.type === "activate"))) {
      return undefined;
    }
    let bonusOutput: BonusRaceOutput;
    try {
      const reduced = reduceBonusRace(this.#bonus, event, this.#options.bonusContent);
      if (!reduced.ok) throw new RangeError(reduced.reason);
      bonusOutput = reduced;
    } catch (error: unknown) {
      this.#engineFailed(error);
      return undefined;
    }
    const before = this.#state;
    const beforeBonus = this.#bonus;
    this.#bonus = bonusOutput.state;
    const output = bonusOutput.raceOutput;
    this.#wpmDeadline = bonusOutput.nextDeadline;
    try {
      // Observe only the reducer's decided state, at its clock (terminal times stay exact).
      this.#wpm.capture(output.state, output.state.clock);
    } catch (error: unknown) {
      this.#engineFailed(error);
      return undefined;
    }
    if (before.phase === "countdown" && output.state.phase !== "countdown") {
      this.#writeBegin();
    }
    this.#tellEnded(before, output.state, answered);
    if (this.#stage !== "running" && this.#stage !== "saving") {
      // A view failed while telling it (`engine_error`): that interruption decides, nothing else.
      return undefined;
    }
    if (beforeBonus.revision !== this.#bonus.revision) {
      this.#scheduleProgress();
    }
    // Effects may change text without changing the legacy race revision. Publish private
    // recovery state reliably; inventories and seeds never go to room followers at large.
    if (this.#options.lease.isAuthoritative()) {
      for (const entrant of this.#entrants.values()) {
        const previous = before.entrants.find((item) => item.entrantId === entrant.entrantId);
        const current = this.#state.entrants.find((item) => item.entrantId === entrant.entrantId);
        if (previous?.textVersion !== current?.textVersion) this.#sendSelf(entrant.entrantId, { volatile: false });
        const oldProjection = bonusPrivateKey(beforeBonus, entrant.entrantId);
        if (oldProjection !== bonusPrivateKey(this.#bonus, entrant.entrantId)) {
          for (const connection of this.#connectionsOf(entrant.accountId)) connection.emit(RACE_BONUS_SELF_EVENT, this.#bonusSelf(entrant.entrantId));
        }
      }
      for (const announcement of bonusOutput.announcements) {
        for (const connection of this.#options.followers()) connection.emit(RACE_BONUS_ANNOUNCEMENT_EVENT,
          { raceId: this.ownership.raceId, revision: this.#bonus.revision, announcement });
      }
    }
    if (output.ended !== undefined) {
      this.#freeze(output.ended);
    } else if (this.#stage === "running") {
      this.#scheduleTick(bonusOutput.nextDeadline);
      this.#scheduleWpm();
    }
    return bonusOutput;
  }

  /**
   * Every entrant the engine just made terminal (a deadline, an abandon, a batch, the end of the
   * race): its tabs learn it reliably, so no page keeps a racing field. The tab that sent the
   * request (`answered`) gets it in its answer instead. A view that fails stops the telling: its
   * `engine_error` interruption alone decides, for every entrant.
   */
  #tellEnded(before: RaceState, after: RaceState, answered: string | undefined): void {
    for (const entrant of after.entrants) {
      if (this.#stage !== "running" && this.#stage !== "saving") {
        return;
      }
      const previous = before.entrants.find((one) => one.entrantId === entrant.entrantId);
      if (previous?.status === "racing" && entrant.status !== "racing") {
        this.#sendSelf(entrant.entrantId, { volatile: false, ...(answered === undefined ? {} : { except: answered }) });
      }
    }
  }

  #scheduleTick(deadline: number | undefined): void {
    this.#cancelTick?.();
    this.#cancelTick = undefined;
    if (deadline === undefined) {
      return;
    }
    // The engine applies every transition due at the handled `now`: a late timer decides nothing.
    this.#cancelTick = this.#options.schedule(() => {
      this.#cancelTick = undefined;
      this.#apply({ type: "tick", now: this.#now() });
    }, Math.max(0, deadline - this.#options.now()));
  }

  /** Sample silence without emitting an event or touching the lease (D-17 owns those hooks). */
  #scheduleWpm(): void {
    if (this.#cancelWpm !== undefined || this.#stage !== "running" || this.#state.phase !== "racing") return;
    this.#cancelWpm = this.#options.schedule(() => {
      this.#cancelWpm = undefined;
      if (this.#stage !== "running") return;
      try {
        const now = this.#now();
        // A delayed deadline timer must reduce first: otherwise an observation could exceed
        // the exact terminal time it will decide. Skip, never backfill or reduce a tick here.
        // The same for a queued pause or resume (D-17): its reduction is dated before `now`.
        const due = this.#leaseEvents.length > 0 || (this.#wpmDeadline !== undefined && now >= this.#wpmDeadline);
        if (!due) this.#wpm.capture(this.#state, now);
      } catch (error: unknown) {
        this.#engineFailed(error);
        return;
      }
      this.#scheduleWpm();
    }, INITIAL_WPM_SERIES_SPACING_MS);
  }

  /** COUNTDOWN → RACING in the database, the first fenced write; keystrokes never wait for it. */
  #writeBegin(): void {
    if (this.#beginWritten) {
      return;
    }
    this.#beginWritten = true;
    void this.#withRetries(() => this.#options.store.beginRacing(this.ownership), this.#timing.saveRetriesMs)
      .then((begun) => {
        if (begun?.won === false && this.#stage === "running") {
          // The race was interrupted or taken over meanwhile: it no longer runs here.
          this.#settle("lost");
        }
      })
      .catch((error: unknown) => this.#unexpected(error));
  }

  /** At most `progressEveryMs` apart, and only while this process can prove it owns the race. */
  #scheduleProgress(): void {
    if (this.#cancelProgress !== undefined) {
      return;
    }
    const wait = Math.max(0, this.#progressSentAt + this.#timing.progressEveryMs - this.#options.now());
    this.#cancelProgress = this.#options.schedule(() => {
      this.#cancelProgress = undefined;
      if (this.#stage !== "running" && this.#stage !== "saving") {
        return;
      }
      if (!this.#options.lease.isAuthoritative()) {
        // Sent once the lease is confirmed again (`leaseChanged`).
        return;
      }
      const now = this.#options.now();
      if (now < this.#progressSentAt + this.#timing.progressEveryMs) {
        // The timer fired early (timers round to the millisecond): never two broadcasts closer than the interval.
        this.#scheduleProgress();
        return;
      }
      this.#progressSentAt = now;
      const progress = this.#progress(now);
      if (progress === undefined) {
        return;
      }
      for (const connection of this.#options.followers()) {
        connection.emit(RACE_PROGRESS_EVENT, progress, { volatile: true });
      }
    }, wait);
  }

  #freeze(end: RaceEnd): void {
    try {
      this.#results = Object.freeze(end.results.map((result) => Object.freeze(toResultRow(result, this.#wpm.freeze(result)))));
    } catch (error: unknown) {
      this.#engineFailed(error);
      return;
    }
    this.#stage = "saving";
    this.#cancelWpm?.();
    this.#cancelWpm = undefined;
    this.#cancelTick?.();
    this.#cancelTick = undefined;
    this.#dropLeaseEvents();
    for (const connection of this.#options.followers()) {
      connection.emit(RACE_CONFIRMING_EVENT, { raceId: this.ownership.raceId });
    }
    this.#saving = this.#save(this.#results).catch((error: unknown) => this.#unexpected(error));
  }

  /**
   * Saves the frozen results (ADR-0004): retried on failure only, a bounded number of times,
   * always with the same array. A lost answer is retried too, and an earlier commit is
   * recognised (`alreadyDone`): a saved result is never reported as lost. After the last
   * retry, the owner gives up explicitly (`save_failed`), unless that call learns the results
   * were saved after all. If the database never answers, nothing is published.
   */
  async #save(results: readonly RaceResultRow[]): Promise<void> {
    const saved = await this.#withRetries(() => this.#options.store.finalizeRace(this.ownership, results), this.#timing.saveRetriesMs);
    if (this.#stage !== "saving") {
      return;
    }
    if (saved?.won === true) {
      this.#settle("saved");
      return;
    }
    if (saved?.won === false) {
      this.#settle("lost");
      return;
    }
    const given = await this.#withRetries(() => this.#options.store.interruptOwnRace(this.ownership, "save_failed"), this.#timing.interruptRetriesMs);
    if (this.#stage !== "saving") {
      return;
    }
    if (given === undefined) {
      this.#logError(`[races] neither the results nor the interruption of ${this.ownership.raceId} could be confirmed`);
      this.#settle("lost");
    } else if (given.won) {
      this.#settle("interrupted");
    } else {
      this.#settle(given.resultsSaved ? "saved" : "lost");
    }
  }

  #engineFailed(error: unknown): void {
    if (this.#stage !== "running" && this.#stage !== "saving") {
      return;
    }
    this.#logError(`[races] the engine failed on ${this.ownership.raceId}: ${error instanceof Error ? error.name : "unknown error"}`);
    try {
      // The reducer is pure: the last good state is intact, and interrupting it only reads it.
      const interrupted = reduceBonusRace(this.#bonus, { type: "interrupt", now: this.#now() });
      if (interrupted.ok) this.#bonus = interrupted.state;
    } catch {
      // The database interruption below is what counts.
    }
    this.#stage = "failing";
    this.#clearTimers();
    void this.#withRetries(() => this.#options.store.interruptOwnRace(this.ownership, "engine_error"), this.#timing.interruptRetriesMs)
      .then((interrupted) => {
        if (interrupted?.won === true) {
          this.#settle("interrupted");
        } else {
          // Saved by an earlier finalisation of ours, ended elsewhere, or no answer (the lease covers it).
          this.#settle(interrupted?.resultsSaved === true ? "saved" : "lost");
        }
      })
      .catch((error: unknown) => this.#unexpected(error));
  }

  /** Terminal: no timer, no renewal, no keystroke; the room's members get a fresh snapshot. */
  #settle(stage: Extract<Stage, "saved" | "interrupted" | "lost">): void {
    if (this.#stage !== "running" && this.#stage !== "saving" && this.#stage !== "failing") {
      return;
    }
    this.#stage = stage;
    this.#clearTimers();
    this.#control.clear();
    this.#options.lease.stop();
    this.#options.onSettled(this.ownership, stage);
  }

  #clearTimers(): void {
    this.#cancelWpm?.();
    this.#cancelWpm = undefined;
    this.#dropLeaseEvents();
    this.#cancelTick?.();
    this.#cancelTick = undefined;
    this.#cancelProgress?.();
    this.#cancelProgress = undefined;
    for (const { cancel } of this.#vacated.values()) {
      cancel();
    }
    this.#vacated.clear();
  }

  /** Pauses and resumes still queued no longer apply once the race is frozen or over (D-17). */
  #dropLeaseEvents(): void {
    this.#cancelDrain?.();
    this.#cancelDrain = undefined;
    this.#leaseEvents.length = 0;
  }

  /** Runs `write`, then retries it after each wait while it throws; undefined if every attempt threw. */
  async #withRetries<Result>(write: () => Promise<Result>, waits: readonly number[]): Promise<Result | undefined> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await write();
      } catch (error: unknown) {
        const wait = waits[attempt];
        this.#logError(`[races] write for ${this.ownership.raceId} failed (attempt ${attempt + 1}): ${describeDatabaseError(error)}`);
        if (wait === undefined || this.#over()) {
          return undefined;
        }
        await new Promise<void>((resolve) => this.#options.schedule(resolve, wait));
        // The race may have ended meanwhile (lost, stopped): no write after that.
        if (this.#over()) {
          return undefined;
        }
      }
    }
  }

  #over(): boolean {
    return this.#stage === "lost" || this.#stage === "stopping" || this.#stage === "saved" || this.#stage === "interrupted";
  }

  #logError(message: string): void {
    (this.#options.logError ?? this.#options.log)(message);
  }

  /** A bug in this runtime, never the engine's: logged, and the race left to its lease. */
  #unexpected(error: unknown): void {
    this.#logError(`[races] runtime failure on ${this.ownership.raceId}: ${error instanceof Error ? error.name : "unknown error"}`);
  }

  /**
   * The answer of `write` if it comes before `deadline`; undefined if it fails or comes too late.
   * Past the deadline, the write is not even sent: the lease covers the race.
   */
  async #withinDeadline<Result>(write: () => Promise<Result>, deadline: number): Promise<Result | undefined> {
    const left = deadline - this.#options.now();
    if (left <= 0) {
      return undefined;
    }
    let cancel: (() => void) | undefined;
    const late = new Promise<undefined>((resolve) => {
      cancel = Number.isFinite(left) ? this.#options.schedule(() => resolve(undefined), left) : undefined;
    });
    try {
      return await Promise.race([write(), late]);
    } catch {
      return undefined;
    } finally {
      cancel?.();
    }
  }

  /**
   * The engine's views are pure too: an exception there is an engine failure like one in
   * `reduceRace`, and ends this race only.
   */
  #view<View>(compute: () => View): View | undefined {
    try {
      return compute();
    } catch (error: unknown) {
      this.#engineFailed(error);
      return undefined;
    }
  }

  #revealFor(selfEntrantId: string | undefined): RaceRevealPayload | undefined {
    return this.#view(() => ({
      reveal: toRaceReveal(this.#state),
      language: this.#options.language,
      entrants: this.#state.entrants.map(({ entrantId }) => ({ entrantId, displayName: this.#entrants.get(entrantId)?.displayName ?? "" })),
      selfEntrantId: selfEntrantId ?? null,
      serverNow: this.#options.now(),
    }));
  }

  #progress(now = this.#options.now()): RaceProgressPayload | undefined {
    return this.#view(() => ({ broadcast: { ...toRaceBroadcast(this.#state, asInstant(now)), revision: this.#bonus.revision }, serverNow: now }));
  }

  #selfFor(entrantId: string, connectionId: string): RaceSelfPayload | undefined {
    return this.#view(() => {
      const id = asEntrantId(entrantId);
      const snapshot = toEntrantSnapshot(this.#state, id);
      // The engine's own live measures, timed exactly as its broadcast times them.
      const measures = toEntrantMeasures(this.#state, id, this.#now());
      if (snapshot === undefined || measures === undefined) {
        throw new Error("An entrant of the race has no snapshot");
      }
      return {
        snapshot,
        measures: { netWpm: measures.netWpm, accuracy: measures.accuracy },
        control: this.#control.get(entrantId)?.connectionId === connectionId ? "controlling" : "observing",
        ...abandonReasonOf(this.#state, entrantId),
      };
    });
  }

  /** The entrant's tabs (but `except`) get its typing state and which of them types. */
  #sendSelf(entrantId: string, { except, volatile }: { readonly except?: string; readonly volatile: boolean }): void {
    const entrant = this.#entrants.get(entrantId);
    if (entrant === undefined) {
      return;
    }
    for (const connection of this.#connectionsOf(entrant.accountId)) {
      if (connection.id === except) {
        continue;
      }
      const self = this.#selfFor(entrantId, connection.id);
      if (self === undefined) {
        return;
      }
      connection.emit(RACE_SELF_EVENT, self, { volatile });
    }
  }

  /** For tests: resolves once the frozen results are settled. */
  async whenSaved(): Promise<void> {
    await this.#saving;
  }
}

const OUTCOMES = { finished: "finished", timedOut: "timed_out", abandoned: "abandoned" } as const;

/** Compare only what the owner can recover, not the revision which advances on every tick. */
function bonusPrivateKey(state: BonusRaceState, entrantId: string): string {
  // Change detection only: the domain still decides which grants are usable. Do not run
  // its full-envelope validator once per entrant twice on every keystroke batch.
  return JSON.stringify({ phase: state.race.phase, status: state.race.entrants.find((item) => item.entrantId === entrantId)?.status,
    grants: state.awards.grants.filter((item) => item.entrantId === entrantId),
    consumed: state.consumed.filter((item) => item.grant.entrantId === entrantId).map((item) => item.id),
    cursor: state.cursors.find((item) => item.entrantId === entrantId)?.seq,
    fog: state.fog.find((item) => item.entrantId === entrantId) });
}

/** One entrant's official result as the engine produced it, written as is (RES-05). */
export function toResultRow(result: EntrantResult, wpmSeries: StoredWpmSeries): RaceResultRow {
  return {
    wpmSeries,
    keyErrors: keyErrorsFromEngine(result.missedKeys),
    entrantId: result.entrantId,
    outcome: OUTCOMES[result.status],
    rank: result.rank,
    elapsedMs: result.elapsed,
    position: result.position,
    length: result.length,
    correctInputs: result.counters.correctInserts,
    totalInputs: result.counters.totalInserts,
    netWpm: result.measures.netWpm,
    rawWpm: result.measures.rawWpm,
    accuracy: result.measures.accuracy,
    ...(result.abandonReason === undefined ? {} : { abandonmentReason: result.abandonReason }),
  };
}

/** Why the entrant abandoned, for its own page to say it (D-06 and D-17 stay apart from a choice). */
function abandonReasonOf(state: RaceState, entrantId: string): { readonly abandonReason?: NonNullable<EntrantState["abandonReason"]> } {
  const reason = state.entrants.find((entrant) => entrant.entrantId === entrantId)?.abandonReason;
  return reason === undefined ? {} : { abandonReason: reason };
}
