import { type ErrorMode, type InputEvent, MAX_BATCH_EVENTS, MAX_BATCHES_PER_SECOND, predictTyping, type TypedMark, typedMarks } from "@incision/domain";
import { type EntrantSnapshotPayload, raceBatchAckSchema, type RaceSelfPayload } from "./protocol";

/** A batch as sent: immutable once sent, so a retry repeats it exactly (engine contract). */
export type SentBatch = { readonly raceId: string; readonly seq: number; readonly textVersion: number; readonly events: readonly InputEvent[] };

export type TypingSessionOptions = {
  readonly raceId: string;
  readonly errorMode: ErrorMode;
  /** Emits the batch and resolves with the server's raw answer; rejects on a timeout or a lost connection. */
  readonly send: (batch: SentBatch) => Promise<unknown>;
  /** Whether the tab is connected; while it is not, the reconnection's snapshot decides what is resent. */
  readonly connected: () => boolean;
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
  /** Something shown changed. */
  readonly onChange: () => void;
};

/** Why the zone accepts no keystroke right now, when it does not. */
export type TypingBlock = "waiting" | "observing" | "suspended" | "over" | "reload";

/** What the typing zone shows: the server's snapshot, with the pending events predicted on top. */
export type TypingView = {
  readonly target: readonly string[];
  readonly typed: readonly string[];
  readonly marks: readonly TypedMark[];
  readonly pendingError: boolean;
  /** The entrant's status on the server (finished, timed out…), never predicted. */
  readonly status: EntrantSnapshotPayload["status"];
  /** Inserts the server counted (D-09), never predicted. */
  readonly totalInserts: number;
};

/**
 * Spacing of batches, with a margin so that network jitter never brings eleven of them into
 * one second on the server, which counts MAX_BATCHES_PER_SECOND in a sliding window.
 */
const SEND_EVERY_MS = Math.ceil(1_000 / MAX_BATCHES_PER_SECOND) + 10;
/** A batch whose answer did not come is sent again after this, unchanged. */
const RESEND_AFTER_MS = 1_000;
/** After a refusal of the server's rate limit, the same batch goes again sooner. */
const RESEND_AFTER_LIMIT_MS = 300;

/**
 * The browser side of keystroke batches (F-04.4, engine contract `KeystrokeResult`). One batch
 * in flight; keystrokes typed meanwhile wait and leave together, at most MAX_BATCH_EVENTS at a
 * time. Every answer brings the server's snapshot, which replaces what is shown; the events not
 * yet applied are drawn on top with the engine's own prediction (`predictTyping`), for display
 * only. Progress, counters, measures and results always come from the server.
 */
export class TypingSession {
  readonly #options: TypingSessionOptions;
  #snapshot: EntrantSnapshotPayload | undefined;
  #measures: RaceSelfPayload["measures"] | undefined;
  #control: RaceSelfPayload["control"] = "observing";
  #inFlight: SentBatch | undefined;
  #pending: InputEvent[] = [];
  #lastSentAt = Number.NEGATIVE_INFINITY;
  #cancelSend: (() => void) | undefined;
  #block: TypingBlock | undefined;

  constructor(options: TypingSessionOptions) {
    this.#options = options;
  }

  get control(): RaceSelfPayload["control"] {
    return this.#control;
  }

  /** The server's latest measures for this entrant (Appendix A, from the engine). */
  get measures(): RaceSelfPayload["measures"] | undefined {
    return this.#measures;
  }

  /** Why keystrokes are not taken now, if they are not. */
  get block(): TypingBlock | undefined {
    if (this.#block !== undefined) {
      return this.#block;
    }
    if (this.#snapshot === undefined) {
      return "waiting";
    }
    if (this.#snapshot.status !== "racing") {
      return "over";
    }
    return this.#control === "observing" ? "observing" : undefined;
  }

  /**
   * The server's state for this entrant (on a reconnection, a control change or another tab's
   * typing). After a lost connection, the batch in flight counts as applied if and only if the
   * snapshot's `ackSeq` reached it; otherwise it is sent again, unchanged, as the only copy.
   */
  receive(self: RaceSelfPayload): void {
    if (self.snapshot.raceId !== this.#options.raceId) {
      return;
    }
    if (this.#block === "over") {
      // Closed by the page: nothing more is taken or sent.
      return;
    }
    this.#snapshot = self.snapshot;
    this.#measures = self.measures;
    this.#control = self.control;
    // A fresh state from the server ends a wait for it (suspended, or a tab not followed yet).
    this.#block = undefined;
    if (this.#control === "observing") {
      // Another tab types: what this one gathered is not sent.
      this.#inFlight = undefined;
      this.#pending = [];
    } else if (this.#inFlight !== undefined && self.snapshot.ackSeq >= this.#inFlight.seq) {
      this.#inFlight = undefined;
    } else if (this.#inFlight !== undefined) {
      // Not applied: the only copy goes again, unchanged (the transport kept none), at the usual
      // spacing so the server's per-player window is respected.
      this.#resendLater(this.#inFlight, Math.max(0, this.#lastSentAt + SEND_EVERY_MS - this.#options.now()));
    }
    this.#options.onChange();
    this.#flush();
  }

  /** One keystroke of the controlling tab. Enter never reaches here (D-16): the zone drops it. */
  type(event: InputEvent): void {
    if (this.block !== undefined) {
      return;
    }
    this.#pending.push(event);
    this.#options.onChange();
    this.#flush();
  }

  view(): TypingView | undefined {
    const snapshot = this.#snapshot;
    if (snapshot === undefined) {
      return undefined;
    }
    const events = [...(this.#inFlight?.events ?? []), ...this.#pending];
    const predicted = events.length === 0 ? undefined : predictTyping(snapshot, events, this.#options.errorMode);
    if (predicted?.ok === true) {
      return {
        target: snapshot.target,
        typed: predicted.typed,
        marks: predicted.marks,
        pendingError: predicted.pendingError,
        status: snapshot.status,
        totalInserts: snapshot.counters.totalInserts,
      };
    }
    // Nothing pending, or an event the server would refuse: the snapshot as it is.
    return {
      target: snapshot.target,
      typed: snapshot.typed,
      marks: typedMarks(snapshot.target, snapshot.typed),
      pendingError: snapshot.pendingError,
      status: snapshot.status,
      totalInserts: snapshot.counters.totalInserts,
    };
  }

  /** The page is leaving the race: nothing more is sent, and late answers are ignored. */
  close(): void {
    this.#cancelSend?.();
    this.#cancelSend = undefined;
    this.#inFlight = undefined;
    this.#pending = [];
    this.#block = "over";
  }

  #flush(): void {
    if (this.#inFlight !== undefined || this.#pending.length === 0 || this.#snapshot === undefined || this.block !== undefined || this.#cancelSend !== undefined) {
      return;
    }
    const wait = this.#lastSentAt + SEND_EVERY_MS - this.#options.now();
    if (wait > 0) {
      this.#cancelSend = this.#options.schedule(() => {
        this.#cancelSend = undefined;
        this.#flush();
      }, wait);
      return;
    }
    const batch: SentBatch = {
      raceId: this.#options.raceId,
      seq: this.#snapshot.ackSeq + 1,
      textVersion: this.#snapshot.textVersion,
      events: this.#pending.splice(0, MAX_BATCH_EVENTS),
    };
    this.#inFlight = batch;
    this.#send(batch);
  }

  #send(batch: SentBatch): void {
    this.#lastSentAt = this.#options.now();
    this.#options.send(batch).then(
      (answer) => this.#answered(batch, answer),
      () => this.#resendLater(batch),
    );
  }

  /** The same batch again, if it is still the one in flight and nothing settled it meanwhile. */
  #resendLater(batch: SentBatch, delayMs = RESEND_AFTER_MS): void {
    if (!this.#options.connected()) {
      return;
    }
    this.#options.schedule(() => {
      // While the server is suspended, resending is how the page learns it is back.
      if (this.#inFlight === batch && (this.#block === undefined || this.#block === "suspended")) {
        this.#send(batch);
      }
    }, delayMs);
  }

  #answered(batch: SentBatch, answer: unknown): void {
    // An answer to a batch no longer in flight (settled by a snapshot, replaced, or the page
    // closed) is ignored.
    if (this.#inFlight !== batch || this.#block === "over") {
      return;
    }
    const ack = raceBatchAckSchema.safeParse(answer);
    if (!ack.success) {
      this.#resendLater(batch);
      return;
    }
    if (!ack.data.ok) {
      switch (ack.data.error) {
        case "SUSPENDED":
          this.#block = "suspended";
          this.#options.onChange();
          this.#resendLater(batch);
          return;
        case "RATE_LIMITED":
          this.#resendLater(batch, RESEND_AFTER_LIMIT_MS);
          return;
        case "NOT_CONTROLLING":
          this.#control = "observing";
          this.#inFlight = undefined;
          this.#pending = [];
          break;
        default:
          // This tab is not following its room's race (yet): a reconnection still being admitted,
          // or the race ended. Its keystrokes wait for the server's next state, which settles the
          // batch in flight as after any reconnection.
          this.#block = "reload";
      }
      this.#options.onChange();
      return;
    }
    const { result, self } = ack.data;
    this.#inFlight = undefined;
    this.#snapshot = self.snapshot;
    this.#measures = self.measures;
    this.#control = self.control;
    this.#block = undefined;
    if (result.outcome === "resync" || result.outcome === "refused") {
      // Nothing of it was applied: the events typed on top of it are dropped too.
      this.#pending = [];
      if (result.outcome === "refused" && (result.reason === "WRONG_RACE" || result.reason === "UNKNOWN_ENTRANT")) {
        this.#block = "reload";
      }
    }
    this.#options.onChange();
    this.#flush();
  }
}
