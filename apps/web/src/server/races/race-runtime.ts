import type { Interruption, RaceOwnership, RaceResultRow, Transition } from "@incision/database";
import {
  asEntrantId,
  asInstant,
  asRaceId,
  computeMeasures,
  type EntrantResult,
  measuredElapsed,
  type RaceEnd,
  type RaceEvent,
  type RaceOutput,
  type RaceState,
  reduceRace,
  toEntrantSnapshot,
  toRaceBroadcast,
  toRaceReveal,
} from "@incision/domain";
import type { KeystrokeBatchPayload, RaceBatchAck, RaceProgressPayload, RaceRevealPayload, RaceSelfPayload } from "../../races/protocol";
import { RACE_CONFIRMING_EVENT, RACE_PROGRESS_EVENT, RACE_REVEAL_EVENT, RACE_SELF_EVENT } from "../../races/protocol";
import type { LeaseState, Schedule } from "./race-lease";
import type { OwnedRace, ShutdownOutcome } from "./race-registry";

/** One open tab following the room, as the room channel admitted it (session checked, member of the room). */
export type RaceConnection = {
  readonly id: string;
  readonly accountId: string;
  readonly emit: (event: string, payload: unknown) => void;
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
};

export type RaceRuntimeOptions = {
  readonly ownership: RaceOwnership;
  readonly state: RaceState;
  readonly entrants: readonly RaceEntrant[];
  readonly store: RaceStore;
  /** Built by the caller with `onChange` wired to `leaseChanged`. */
  readonly lease: LeaseView;
  /** The server's clock, in integer milliseconds since the epoch, never going backwards. */
  readonly now: () => number;
  readonly schedule: Schedule;
  /** The room's tabs, read when the race needs them. */
  readonly followers: () => Iterable<RaceConnection>;
  /** The race ended here (saved, interrupted, or its ownership lost): the room's members get a fresh snapshot. */
  readonly onSettled: (ownership: RaceOwnership) => void;
  readonly log: (message: string) => void;
  readonly timing?: Partial<RuntimeTiming>;
};

export type RuntimeTiming = {
  /** COURSE-05 and F-04.4: everyone's progress at most four times a second. */
  readonly progressEveryMs: number;
  /** Waits before each retry of a write that failed, never periodic (ADR-0004). */
  readonly saveRetriesMs: readonly number[];
  readonly interruptRetriesMs: readonly number[];
};

const TIMING: RuntimeTiming = {
  progressEveryMs: 250,
  saveRetriesMs: [1_000, 2_000, 4_000, 8_000],
  interruptRetriesMs: [1_000, 2_000],
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
  #state: RaceState;
  #stage: Stage = "running";
  /** Frozen at the end and sent unchanged by every attempt, until one is confirmed. */
  #results: readonly RaceResultRow[] | undefined;
  /** Entrant id → the tab that types for it. */
  readonly #control = new Map<string, string>();
  #cancelTick: (() => void) | undefined;
  #cancelProgress: (() => void) | undefined;
  #progressSentAt = Number.NEGATIVE_INFINITY;
  #beginWritten = false;
  #saving: Promise<void> | undefined;

  constructor(options: RaceRuntimeOptions) {
    this.#options = options;
    this.ownership = options.ownership;
    this.#state = options.state;
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

  /** Starts the renewals, reveals the race to the room and schedules its first transition. */
  start(): void {
    this.#options.lease.start();
    for (const connection of this.#options.followers()) {
      this.follow(connection);
    }
    this.#apply({ type: "tick", now: this.#now() });
  }

  /** A tab of the room (re)opened: it gets the race, and the input if its entrant has no typing tab. */
  follow(connection: RaceConnection): void {
    if (this.#stage !== "running" && this.#stage !== "saving") {
      return;
    }
    const entrant = this.#entrantOf(connection.accountId);
    if (entrant !== undefined && !this.#controllerFollows(entrant.entrantId)) {
      this.#control.set(entrant.entrantId, connection.id);
    }
    connection.emit(RACE_REVEAL_EVENT, this.#revealFor(entrant?.entrantId));
    connection.emit(RACE_PROGRESS_EVENT, this.#progress());
    if (entrant !== undefined) {
      connection.emit(RACE_SELF_EVENT, this.#selfFor(entrant.entrantId, connection.id));
    }
    if (this.#stage === "saving") {
      connection.emit(RACE_CONFIRMING_EVENT, { raceId: this.ownership.raceId });
    }
  }

  /** A tab closed or left the room: its entrant has no typing tab until one follows or asks. */
  unfollow(connectionId: string): void {
    for (const [entrantId, controller] of this.#control) {
      if (controller === connectionId) {
        this.#control.delete(entrantId);
      }
    }
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
    this.#control.set(entrant.entrantId, connection.id);
    this.#sendSelf(entrant.entrantId);
    return "ok";
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
    if (this.#control.get(entrant.entrantId) !== connection.id) {
      return { ok: false, error: "NOT_CONTROLLING" };
    }
    if (!this.#options.lease.isAuthoritative()) {
      return { ok: false, error: "SUSPENDED" };
    }
    const output = this.#apply({
      type: "keystrokes",
      now: this.#now(),
      batch: { raceId: asRaceId(payload.raceId), entrantId: asEntrantId(entrant.entrantId), seq: payload.seq, textVersion: payload.textVersion, events: payload.events },
    });
    if (output?.keystrokes === undefined) {
      return { ok: false, error: "NO_RACE" };
    }
    // The other tabs of this entrant follow its typing.
    for (const other of this.#connectionsOf(entrant.accountId)) {
      if (other.id !== connection.id) {
        other.emit(RACE_SELF_EVENT, this.#selfFor(entrant.entrantId, other.id));
      }
    }
    return { ok: true, result: output.keystrokes, self: this.#selfFor(entrant.entrantId, connection.id) };
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

  /** The lease's view changed (ADR-0004). A lost lease never comes back: the race ended elsewhere. */
  leaseChanged(state: LeaseState): void {
    if (state === "lost" && (this.#stage === "running" || this.#stage === "saving")) {
      this.#options.log(`[races] ownership of ${this.ownership.raceId} lost: the race stops here`);
      this.#settle("lost");
    } else if (state === "held" && this.#stage === "running") {
      // Broadcasts held back while the lease was suspended go out now.
      this.#scheduleProgress();
    }
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
      const saved = await this.#withinDeadline(this.#options.store.finalizeRace(ownership, results), deadline);
      if (saved?.won === true) {
        return "finalised";
      }
      if (saved?.won === false) {
        // Someone else ended the race (a takeover): nothing of ours to publish.
        return "left";
      }
    }
    const stopped = await this.#withinDeadline(this.#options.store.interruptOwnRace(ownership, "server_stopped"), deadline);
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
      if (connection.id === controller) {
        return true;
      }
    }
    return false;
  }

  /**
   * Hands one event to the engine. An unexpected exception there ends this race only: the last
   * good state is interrupted in memory and in the database (`engine_error`).
   */
  #apply(event: RaceEvent): RaceOutput | undefined {
    if (this.#stage !== "running" && !(this.#stage === "saving" && event.type === "keystrokes")) {
      return undefined;
    }
    let output: RaceOutput;
    try {
      output = reduceRace(this.#state, event);
    } catch (error: unknown) {
      this.#engineFailed(error);
      return undefined;
    }
    const before = this.#state;
    this.#state = output.state;
    if (before.phase === "countdown" && output.state.phase !== "countdown") {
      this.#writeBegin();
    }
    if (output.changed) {
      this.#scheduleProgress();
    }
    if (output.ended !== undefined) {
      this.#freeze(output.ended);
    } else if (this.#stage === "running") {
      this.#scheduleTick(output.nextDeadline);
    }
    return output;
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

  /** COUNTDOWN → RACING in the database, the first fenced write; keystrokes never wait for it. */
  #writeBegin(): void {
    if (this.#beginWritten) {
      return;
    }
    this.#beginWritten = true;
    void this.#withRetries(() => this.#options.store.beginRacing(this.ownership), this.#timing.saveRetriesMs).then((begun) => {
      if (begun?.won === false && this.#stage === "running") {
        // The race was interrupted or taken over meanwhile: it no longer runs here.
        this.#settle("lost");
      }
    });
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
      this.#progressSentAt = this.#options.now();
      const progress = this.#progress();
      for (const connection of this.#options.followers()) {
        connection.emit(RACE_PROGRESS_EVENT, progress);
      }
    }, wait);
  }

  #freeze(end: RaceEnd): void {
    this.#results = end.results.map(toResultRow);
    this.#stage = "saving";
    this.#cancelTick?.();
    this.#cancelTick = undefined;
    for (const connection of this.#options.followers()) {
      connection.emit(RACE_CONFIRMING_EVENT, { raceId: this.ownership.raceId });
    }
    this.#saving = this.#save(this.#results);
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
      this.#options.log(`[races] neither the results nor the interruption of ${this.ownership.raceId} could be confirmed`);
      this.#settle("lost");
    } else if (given.won) {
      this.#settle("interrupted");
    } else {
      this.#settle(given.resultsSaved ? "saved" : "lost");
    }
  }

  #engineFailed(error: unknown): void {
    this.#options.log(`[races] the engine failed on ${this.ownership.raceId}: ${error instanceof Error ? error.name : "unknown error"}`);
    try {
      // The reducer is pure: the last good state is intact, and interrupting it only reads it.
      this.#state = reduceRace(this.#state, { type: "interrupt", now: this.#now() }).state;
    } catch {
      // The database interruption below is what counts.
    }
    this.#stage = "failing";
    this.#clearTimers();
    void this.#withRetries(() => this.#options.store.interruptOwnRace(this.ownership, "engine_error"), this.#timing.interruptRetriesMs).then(
      (interrupted) => {
        if (interrupted?.won === true) {
          this.#settle("interrupted");
        } else {
          // Saved by an earlier finalisation of ours, ended elsewhere, or no answer (the lease covers it).
          this.#settle(interrupted?.resultsSaved === true ? "saved" : "lost");
        }
      },
    );
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
    this.#options.onSettled(this.ownership);
  }

  #clearTimers(): void {
    this.#cancelTick?.();
    this.#cancelTick = undefined;
    this.#cancelProgress?.();
    this.#cancelProgress = undefined;
  }

  /** Runs `write`, then retries it after each wait while it throws; undefined if every attempt threw. */
  async #withRetries<Result>(write: () => Promise<Result>, waits: readonly number[]): Promise<Result | undefined> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await write();
      } catch (error: unknown) {
        const wait = waits[attempt];
        this.#options.log(`[races] write for ${this.ownership.raceId} failed (attempt ${attempt + 1}): ${error instanceof Error ? error.name : "unknown error"}`);
        if (wait === undefined || this.#stage === "lost" || this.#stage === "stopping" || this.#stage === "saved" || this.#stage === "interrupted") {
          return undefined;
        }
        await new Promise<void>((resolve) => this.#options.schedule(resolve, wait));
      }
    }
  }

  /** The answer of `write` if it comes before `deadline`; undefined if it fails or comes too late. */
  async #withinDeadline<Result>(write: Promise<Result>, deadline: number): Promise<Result | undefined> {
    const left = deadline - this.#options.now();
    if (left <= 0) {
      write.catch(() => undefined);
      return undefined;
    }
    let cancel: (() => void) | undefined;
    const late = new Promise<undefined>((resolve) => {
      cancel = Number.isFinite(left) ? this.#options.schedule(() => resolve(undefined), left) : undefined;
    });
    try {
      return await Promise.race([write, late]);
    } catch {
      return undefined;
    } finally {
      cancel?.();
    }
  }

  #revealFor(selfEntrantId: string | undefined): RaceRevealPayload {
    const reveal = toRaceReveal(this.#state);
    return {
      reveal,
      entrants: this.#state.entrants.map(({ entrantId }) => ({ entrantId, displayName: this.#entrants.get(entrantId)?.displayName ?? "" })),
      selfEntrantId: selfEntrantId ?? null,
      serverNow: this.#options.now(),
    };
  }

  #progress(): RaceProgressPayload {
    const now = this.#options.now();
    return { broadcast: toRaceBroadcast(this.#state, asInstant(now)), serverNow: now };
  }

  #selfFor(entrantId: string, connectionId: string): RaceSelfPayload {
    const snapshot = toEntrantSnapshot(this.#state, asEntrantId(entrantId));
    if (snapshot === undefined) {
      throw new Error("An entrant of the race has no snapshot");
    }
    const entrant = this.#state.entrants.find((candidate) => candidate.entrantId === entrantId);
    const elapsed = measuredElapsed(this.#state.startsAt, this.#now(), entrant?.endedAt ?? this.#state.endedAt);
    const { netWpm, accuracy } = computeMeasures(snapshot.counters, elapsed);
    return {
      snapshot,
      measures: { netWpm, accuracy },
      control: this.#control.get(entrantId) === connectionId ? "controlling" : "observing",
    };
  }

  #sendSelf(entrantId: string): void {
    const entrant = this.#entrants.get(entrantId);
    if (entrant === undefined) {
      return;
    }
    for (const connection of this.#connectionsOf(entrant.accountId)) {
      connection.emit(RACE_SELF_EVENT, this.#selfFor(entrantId, connection.id));
    }
  }

  /** For tests: resolves once the frozen results are settled. */
  async whenSaved(): Promise<void> {
    await this.#saving;
  }
}

const OUTCOMES = { finished: "finished", timedOut: "timed_out", abandoned: "abandoned" } as const;

/** One entrant's official result as the engine produced it, written as is (RES-05). */
export function toResultRow(result: EntrantResult): RaceResultRow {
  return {
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
