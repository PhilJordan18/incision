import type { InputEvent } from "@incision/domain";
import {
  raceConfirmingPayloadSchema,
  raceProgressPayloadSchema,
  type RaceProgressPayload,
  raceRevealPayloadSchema,
  type RaceRevealPayload,
  raceSelfPayloadSchema,
  type RaceSelfPayload,
} from "./protocol";
import { type SentBatch, type TypingBlock, TypingSession, type TypingView } from "./typing-session";

/** What the race view draws. A new object after every change, so React sees it changed. */
export type RaceClientState = {
  readonly reveal?: RaceRevealPayload["reveal"];
  /** The language of the race's text. */
  readonly language?: RaceRevealPayload["language"];
  readonly entrants: RaceRevealPayload["entrants"];
  readonly selfEntrantId: string | null;
  readonly progress?: RaceProgressPayload["broadcast"];
  /** The server's measures for this entrant (Appendix A, computed by the engine). */
  readonly measures?: RaceSelfPayload["measures"];
  readonly control?: RaceSelfPayload["control"];
  /** Why this entrant abandoned, once it did (its own state from the server). */
  readonly abandonReason?: RaceSelfPayload["abandonReason"];
  readonly typing?: TypingView;
  readonly block?: TypingBlock;
  /** The race ended and its results are being saved; nothing official yet. */
  readonly confirming: boolean;
};

/** The tab's connection, as the page attaches it. */
export type RaceTransport = {
  readonly sendBatch: (batch: SentBatch) => Promise<unknown>;
  readonly connected: () => boolean;
};

export type RaceClientOptions = {
  /** The browser's clock; the server's is this plus the offset learnt from each message. */
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
};

const EMPTY: RaceClientState = { entrants: [], selfEntrantId: null, confirming: false };

/**
 * The race as one tab sees it (F-04.0): the reveal, everyone's progress (newest revision of the
 * current race only), this entrant's typing session and its server-side measures. Every message
 * is validated before use. Shared with React through `subscribe` and `getState`.
 */
export class RaceClient {
  readonly #options: RaceClientOptions;
  readonly #listeners = new Set<() => void>();
  #state: RaceClientState = EMPTY;
  #session: TypingSession | undefined;
  #transport: RaceTransport | undefined;
  /** Server clock minus browser clock, from the latest message (no round-trip compensation, F-04.2). */
  #offsetMs = 0;

  constructor(options: RaceClientOptions) {
    this.#options = options;
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => void this.#listeners.delete(listener);
  };

  readonly getState = (): RaceClientState => this.#state;

  /** The page's socket: batches go through it while it is attached. */
  attach(transport: RaceTransport): void {
    this.#transport = transport;
  }

  /** The socket closed for good (the page unmounts): nothing is sent or resent any more. */
  detach(): void {
    this.#transport = undefined;
  }

  /** The server's clock as this tab estimates it. */
  serverNow(): number {
    return this.#options.now() + this.#offsetMs;
  }

  reveal(payload: unknown): void {
    const parsed = raceRevealPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return;
    }
    const { reveal, language, entrants, selfEntrantId, serverNow } = parsed.data;
    this.#offsetMs = serverNow - this.#options.now();
    if (this.#state.reveal?.raceId !== reveal.raceId) {
      this.#session?.close();
      this.#session =
        selfEntrantId === null
          ? undefined
          : new TypingSession({
              raceId: reveal.raceId,
              errorMode: reveal.errorMode,
              send: (batch) => this.#transport?.sendBatch(batch) ?? Promise.reject(new Error("offline")),
              connected: () => this.#transport?.connected() === true,
              now: this.#options.now,
              schedule: this.#options.schedule,
              onChange: () => this.#update({}),
            });
      this.#state = { ...EMPTY };
    }
    this.#update({ reveal, language, entrants, selfEntrantId });
  }

  progress(payload: unknown): void {
    const parsed = raceProgressPayloadSchema.safeParse(payload);
    if (!parsed.success || parsed.data.broadcast.raceId !== this.#state.reveal?.raceId) {
      return;
    }
    this.#offsetMs = parsed.data.serverNow - this.#options.now();
    const current = this.#state.progress;
    if (current !== undefined && current.revision > parsed.data.broadcast.revision) {
      return;
    }
    this.#update({ progress: parsed.data.broadcast });
  }

  self(payload: unknown): void {
    const parsed = raceSelfPayloadSchema.safeParse(payload);
    if (!parsed.success || parsed.data.snapshot.raceId !== this.#state.reveal?.raceId) {
      return;
    }
    if (this.#session === undefined) {
      return;
    }
    if (parsed.data.abandonReason !== this.#state.abandonReason) {
      this.#state = { ...this.#state, abandonReason: parsed.data.abandonReason };
    }
    // The session notifies through `onChange`, which updates the state once.
    this.#session.receive(parsed.data);
  }

  confirming(payload: unknown): void {
    const parsed = raceConfirmingPayloadSchema.safeParse(payload);
    if (parsed.success && parsed.data.raceId === this.#state.reveal?.raceId) {
      this.#update({ confirming: true });
    }
  }

  /** A keystroke of this tab; the session decides whether it is taken. */
  type(event: InputEvent): void {
    this.#session?.type(event);
  }

  #update(change: Partial<RaceClientState>): void {
    const session = this.#session;
    this.#state = {
      ...this.#state,
      ...change,
      ...(session === undefined ? {} : { typing: session.view(), block: session.block, control: session.control, measures: session.measures }),
    };
    for (const listener of this.#listeners) {
      listener();
    }
  }
}
