import { guestCommandFence, type GuestMemberCommandInput, type GuestMemberCommandResult } from "@incision/database";
import { MAX_BATCHES_PER_SECOND } from "@incision/domain";
import type { GuestCredential } from "../identity/guest-cookie";
import type { SessionRegistry } from "./session-registry";

type Cancel = () => void;
type Window = { times: number[]; inFlight: boolean };
type Grant = {
  proof: GuestCredential; lobbyId: string; memberId: string; epoch: number;
  expiresAt: number; verifiedAt: number; pendingAt?: number; cancel?: Cancel;
};
export type GuestCommandFailure = { readonly ok: false; readonly error: "UNAUTHORIZED" | "UNAVAILABLE" | "RATE_LIMITED" };
export type GuestCommandStore = <Answer>(input: GuestMemberCommandInput<Answer>) => Promise<GuestMemberCommandResult<Answer>>;
export const GUEST_COMMAND_LIMIT = { maxPerSecond: MAX_BATCHES_PER_SECOND, maxIdentities: 10_000, persistEveryMs: 60_000 } as const;
const IDLE_MS = 86_400_000;
const schedule = (callback: () => void, delay: number): Cancel => {
  const timer = setTimeout(callback, delay); timer.unref?.(); return () => clearTimeout(timer);
};

/** No SQL per batch: single-process grants, fenced membership changes, coalesced activity. */
export class GuestCommandGate {
  readonly #windows = new Map<string, Window>();
  readonly #grants = new Map<string, Grant>();
  #lastPrune = 0;
  #stopped = false;
  constructor(readonly options: {
    readonly store: GuestCommandStore; readonly registry: SessionRegistry; readonly now: () => number;
    readonly schedule?: typeof schedule;
  }) {}

  async run<Answer>(input: {
    readonly proof: GuestCredential; readonly lobbyId: string; readonly memberId: string;
    readonly alive: () => boolean;
    readonly apply: () => { readonly answer: Answer; readonly activity: boolean };
  }): Promise<Answer | GuestCommandFailure> {
    if (this.#stopped) return { ok: false, error: "UNAVAILABLE" };
    const now = this.options.now();
    if (now - this.#lastPrune >= 1_000) {
      for (const [id, window] of this.#windows) {
        if (!window.inFlight && window.times.every((at) => now - at >= 1_000)) this.#windows.delete(id);
      }
      for (const [id, grant] of this.#grants) {
        if (grant.pendingAt === undefined && now - grant.verifiedAt >= GUEST_COMMAND_LIMIT.persistEveryMs) this.#grants.delete(id);
      }
      this.#lastPrune = now;
    }
    if (!this.#grants.has(input.proof.id) && this.#grants.size >= GUEST_COMMAND_LIMIT.maxIdentities) return { ok: false, error: "RATE_LIMITED" };
    const previous = this.#windows.get(input.proof.id);
    if (previous === undefined && this.#windows.size >= GUEST_COMMAND_LIMIT.maxIdentities) return { ok: false, error: "RATE_LIMITED" };
    const window = previous ?? { times: [], inFlight: false };
    window.times = window.times.filter((at) => now - at < 1_000);
    this.#windows.set(input.proof.id, window);
    if (window.inFlight || window.times.length >= GUEST_COMMAND_LIMIT.maxPerSecond) return { ok: false, error: "RATE_LIMITED" };
    window.times.push(now); window.inFlight = true;
    try {
      await guestCommandFence().idle();
      if (this.#stopped) return { ok: false, error: "UNAVAILABLE" };
      if (!input.alive()) return { ok: false, error: "UNAUTHORIZED" };
      const epoch = guestCommandFence().epoch;
      const grant = this.#grants.get(input.proof.id);
      const at = this.options.now();
      if (grant !== undefined && grant.epoch === epoch && grant.memberId === input.memberId &&
        grant.lobbyId === input.lobbyId && grant.proof.secretDigest === input.proof.secretDigest &&
        grant.expiresAt > at + GUEST_COMMAND_LIMIT.persistEveryMs &&
        at - grant.verifiedAt < GUEST_COMMAND_LIMIT.persistEveryMs) {
        // No await between authority check and synchronous engine application.
        const result = input.apply();
        if (result.activity) {
          grant.pendingAt = at; grant.expiresAt = Math.max(grant.expiresAt, at + IDLE_MS);
          this.options.registry.refreshGuest(input.proof.id, grant.expiresAt);
          this.#schedule(grant);
        }
        return result.answer;
      }
      grant?.cancel?.();
      const result = await this.options.store<Answer | GuestCommandFailure>({
        proof: input.proof, lobbyId: input.lobbyId, memberId: input.memberId,
        run: () => {
          if (guestCommandFence().pending > 0 || guestCommandFence().epoch !== epoch) return { answer: { ok: false, error: "UNAVAILABLE" }, activity: false };
          if (!input.alive()) return { answer: { ok: false, error: "UNAUTHORIZED" }, activity: false };
          const applied = input.apply();
          return { answer: applied.answer, activity: applied.activity || grant?.pendingAt !== undefined,
            activityAt: applied.activity ? this.options.now() : grant?.pendingAt };
        },
      });
      if (result.kind !== "authorized") { this.#revoke(input.proof.id); return { ok: false, error: "UNAUTHORIZED" }; }
      // A concurrent transition invalidates the grant even when the SQL read won first.
      if (epoch === guestCommandFence().epoch && guestCommandFence().pending === 0) {
        this.#grants.set(input.proof.id, { proof: input.proof, lobbyId: input.lobbyId, memberId: input.memberId,
          epoch, expiresAt: result.session.expiresAt.getTime(), verifiedAt: this.options.now() });
      } else if (grant !== undefined) { grant.cancel = undefined; this.#schedule(grant); }
      this.options.registry.refreshGuest(result.session.id, result.session.expiresAt.getTime());
      return result.answer;
    } catch {
      // Never replay a callback after SQL failure; cut the guest's authority immediately.
      this.#revoke(input.proof.id);
      return { ok: false, error: "UNAVAILABLE" };
    } finally { window.inFlight = false; }
  }

  #schedule(grant: Grant): void {
    if (grant.cancel !== undefined || grant.pendingAt === undefined || this.#stopped) return;
    grant.cancel = (this.options.schedule ?? schedule)(() => {
      grant.cancel = undefined;
      void this.#flush(grant);
    }, Math.max(0, grant.verifiedAt + GUEST_COMMAND_LIMIT.persistEveryMs - this.options.now()));
  }

  async #flush(grant: Grant): Promise<void> {
    await guestCommandFence().idle();
    if (this.#grants.get(grant.proof.id) !== grant || grant.pendingAt === undefined) return;
    const window = this.#windows.get(grant.proof.id);
    if (window?.inFlight) {
      grant.cancel = (this.options.schedule ?? schedule)(() => { grant.cancel = undefined; void this.#flush(grant); }, 100);
      return;
    }
    const slot = window ?? { times: [], inFlight: false };
    this.#windows.set(grant.proof.id, slot); slot.inFlight = true;
    const acceptedAt = grant.pendingAt;
    const epoch = guestCommandFence().epoch;
    try {
      const result = await this.options.store({ proof: grant.proof, lobbyId: grant.lobbyId, memberId: grant.memberId,
        run: () => ({ answer: undefined, activity: true, activityAt: acceptedAt }),
      });
      if (result.kind !== "authorized") { this.#revoke(grant.proof.id); return; }
      grant.pendingAt = undefined; grant.verifiedAt = this.options.now(); grant.epoch = epoch;
      grant.expiresAt = result.session.expiresAt.getTime();
      this.options.registry.refreshGuest(grant.proof.id, grant.expiresAt);
    } catch { this.#revoke(grant.proof.id); }
    finally { slot.inFlight = false; }
  }

  #revoke(id: string): void {
    this.#grants.get(id)?.cancel?.(); this.#grants.delete(id); this.options.registry.revokeGuest(id);
  }

  /** Graceful shutdown drains accepted activity; an abrupt crash can lose the last interval. */
  async stop(): Promise<void> {
    this.#stopped = true;
    while ([...this.#windows.values()].some((slot) => slot.inFlight)) await new Promise((resolve) => setTimeout(resolve, 10));
    await Promise.all([...this.#grants.values()].map(async (grant) => { grant.cancel?.(); grant.cancel = undefined; await this.#flush(grant); }));
  }
}
