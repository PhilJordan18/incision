import {
  bonusActivationAckSchema, bonusAnnouncementSchema, bonusSelfSchema,
  type BonusActivationPayload, type BonusSelf, type ParsedBonusAck, type ParsedBonusAnnouncement,
} from "./bonus-protocol";

type DomainReply = Extract<ParsedBonusAck, { ok: true }>["result"];
export type BonusClientState = {
  readonly self?: BonusSelf;
  readonly synchronized: boolean;
  readonly pending?: BonusActivationPayload;
  readonly sending: boolean;
  readonly error?: string;
  readonly reply?: DomainReply;
  readonly announcements: readonly ParsedBonusAnnouncement[];
  readonly fogVisible: boolean;
};
export type BonusTransport = { readonly send: (command: BonusActivationPayload) => Promise<unknown> };
export type BonusClientOptions = {
  /** Share RaceClient.serverNow, not an independently estimated browser clock. */
  readonly serverNow: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
};
const empty = (): BonusClientState => ({ synchronized: false, sending: false, announcements: [], fogVisible: false });
const ACK_TIMEOUT_MS = 3000;
const MAX_FACTS = 180; // 30 entrants × 3 grants × (activation + at most one expiry).

/** Isolated controller; the view/socket adapter is deliberately a later slice.
 * Retry is explicit, never an automatic loop (including after RATE_LIMITED).
 * It owns no typing, text, PRNG, DOM event handler or business-rule implementation.
 */
export class BonusClient {
  readonly #options: BonusClientOptions;
  readonly #listeners = new Set<() => void>();
  readonly #seen = new Set<string>();
  #state: BonusClientState = empty();
  #raceId = "";
  #entrantId: string | null = null;
  #controlling = false;
  #racing = false;
  #transport?: BonusTransport;
  #generation = 0;
  #announcementRevision = -1;
  #cancelRequest?: () => void;
  #cancelFog?: () => void;
  #disposed = false;

  constructor(options: BonusClientOptions) { this.#options = options; }
  readonly getState = (): BonusClientState => this.#state;
  readonly subscribe = (listener: () => void): (() => void) => {
    if (this.#disposed) return () => {};
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  /** New race or account: invalidate old promises, timers, private state and facts. */
  begin(input: { readonly raceId: string; readonly entrantId: string | null }): void {
    if (this.#disposed) return;
    this.disconnect();
    this.#cancelFog?.();
    this.#raceId = input.raceId;
    this.#entrantId = input.entrantId;
    this.#controlling = false;
    this.#racing = false;
    this.#seen.clear();
    this.#announcementRevision = -1;
    this.#state = empty();
    this.#publish({});
  }

  /** Call before re-following the room; await its fresh private snapshot before sending. */
  connect(transport: BonusTransport): void {
    if (this.#disposed) return;
    this.disconnect();
    this.#transport = transport;
  }

  disconnect(): void {
    this.#generation += 1;
    this.#cancelRequest?.();
    this.#cancelRequest = undefined;
    this.#transport = undefined;
    this.#publish({ synchronized: false, sending: false });
  }

  /** Control/phase comes from the existing authoritative race client, not the key event. */
  context(input: { readonly controlling: boolean; readonly racing: boolean }): void {
    if (this.#disposed) return;
    if ((this.#controlling && !input.controlling) || !input.racing) {
      this.#generation += 1;
      this.#cancelRequest?.();
      this.#publish({ sending: false, synchronized: false, ...(!input.racing ? { pending: undefined } : {}) });
    }
    this.#controlling = input.controlling;
    this.#racing = input.racing;
    if (!input.racing) {
      this.#cancelFog?.();
      this.#publish({ fogVisible: false });
    }
  }

  self(payload: unknown): void {
    if (this.#disposed || !this.#transport || this.#entrantId === null) return;
    const parsed = bonusSelfSchema.safeParse(payload);
    if (!parsed.success || parsed.data.raceId !== this.#raceId) return;
    const self = parsed.data;
    const previous = this.#state.self;
    if (previous && (self.revision < previous.revision || self.ackSeq < previous.ackSeq)) return;
    // A newer cursor can belong to another controlling tab: never replay an obsolete intent.
    const superseded = this.#state.pending && self.ackSeq > this.#state.pending.seq;
    this.#publish({ self, synchronized: true, ...(superseded ? { pending: undefined } : {}) });
    this.#refreshFog();
  }

  announce(payload: unknown): void {
    if (this.#disposed || !this.#transport) return;
    const parsed = bonusAnnouncementSchema.safeParse(payload);
    if (!parsed.success || parsed.data.raceId !== this.#raceId) return;
    const fact = parsed.data;
    if (fact.revision < this.#announcementRevision) return;
    const id = fact.announcement.type === "activated" ? fact.announcement.receipt.id : fact.announcement.id;
    if (!id.startsWith(`${this.#raceId}:`) || this.#seen.has(id) || this.#seen.size >= MAX_FACTS) return;
    this.#seen.add(id);
    this.#announcementRevision = fact.revision;
    this.#publish({ announcements: [...this.#state.announcements, fact] });
  }

  /** A fresh user intent or explicit retry. No grant is removed until the server says so. */
  activate(): boolean {
    const { self, pending, synchronized, sending } = this.#state;
    if (this.#disposed || !this.#transport || !this.#racing || !this.#controlling ||
      this.#entrantId === null || !synchronized || sending || !self?.enabled) return false;
    const grant = self.grants[0];
    if (!pending && (!grant || self.ackSeq === Number.MAX_SAFE_INTEGER)) return false;
    const command = pending ?? { raceId: this.#raceId, seq: self.ackSeq + 1, milestone: grant!.milestone };
    const generation = ++this.#generation;
    this.#publish({ pending: command, sending: true, error: undefined, reply: undefined });
    this.#cancelRequest = this.#options.schedule(() => {
      if (generation !== this.#generation) return;
      this.#generation += 1;
      this.#publish({ sending: false, error: "ACK_TIMEOUT" });
    }, ACK_TIMEOUT_MS);
    // Capture this transport, including synchronous adapter errors, in a handled promise.
    const transport = this.#transport;
    void Promise.resolve().then(() => {
      if (generation !== this.#generation) return undefined;
      return transport.send(command);
    }).then(payload => {
      if (generation !== this.#generation || this.#disposed) return;
      this.#cancelRequest?.();
      const parsed = bonusActivationAckSchema.safeParse(payload);
      if (!parsed.success) {
        this.#publish({ sending: false, error: "INVALID_RESPONSE" });
        return;
      }
      const ack = parsed.data;
      if (!ack.ok) {
        this.#publish({ sending: false, error: ack.error });
        return;
      }
      if (ack.self.raceId !== this.#raceId || ack.result.seq !== command.seq ||
        (ack.result.ok && ack.self.ackSeq < command.seq) ||
        (ack.result.ok && (ack.result.receipt.grant.entrantId !== this.#entrantId ||
          ack.result.receipt.grant.milestone !== command.milestone ||
          ack.result.receipt.id !== `${this.#raceId}:${this.#entrantId}:${command.milestone}`))) {
        this.#publish({ sending: false, error: "INVALID_RESPONSE" });
        return;
      }
      this.self(ack.self);
      this.#publish({ sending: false, pending: undefined, reply: ack.result,
        error: ack.result.ok ? undefined : ack.result.reason });
    }).catch(() => {
      if (generation !== this.#generation || this.#disposed) return;
      this.#cancelRequest?.();
      this.#publish({ sending: false, error: "OFFLINE" });
    });
    return true;
  }

  /** Re-evaluate after the existing race clock offset changes; no independent clock syncing. */
  clockChanged(): void { if (!this.#disposed) this.#refreshFog(); }

  dispose(): void {
    this.disconnect();
    this.#cancelFog?.();
    this.#listeners.clear();
    this.#state = empty();
    this.#disposed = true;
  }

  #refreshFog(): void {
    this.#cancelFog?.();
    const fog = this.#state.self?.fog;
    const now = this.#options.serverNow();
    const visible = this.#racing && !!fog && now >= fog.startsAt && now < fog.expiresAt;
    this.#publish({ fogVisible: visible });
    if (this.#racing && fog && now < fog.expiresAt) {
      const delay = now < fog.startsAt ? fog.startsAt - now : fog.expiresAt - now;
      this.#cancelFog = this.#options.schedule(() => this.#refreshFog(), Math.min(delay, 2_147_483_647));
    }
  }

  #publish(change: Partial<BonusClientState>): void {
    this.#state = { ...this.#state, ...change };
    for (const listener of this.#listeners) listener();
  }
}
