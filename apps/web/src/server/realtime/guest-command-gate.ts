import type { GuestMemberCommandInput, GuestMemberCommandResult } from "@incision/database";
import { MAX_BATCHES_PER_SECOND } from "@incision/domain";
import type { GuestCredential } from "../identity/guest-cookie";
import type { SessionRegistry } from "./session-registry";

type Window = { times: number[]; inFlight: boolean };
export type GuestCommandFailure = { readonly ok: false; readonly error: "UNAUTHORIZED" | "UNAVAILABLE" | "RATE_LIMITED" };
export type GuestCommandStore = <Answer>(input: GuestMemberCommandInput<Answer>) => Promise<GuestMemberCommandResult<Answer>>;
export const GUEST_COMMAND_LIMIT = { maxPerSecond: MAX_BATCHES_PER_SECOND, maxIdentities: 10_000 } as const;

/** All guest tabs share the pre-SQL budget. No passive event calls this coordinator. */
export class GuestCommandGate {
  readonly #windows = new Map<string, Window>();
  #lastPrune = 0;
  constructor(readonly options: { readonly store: GuestCommandStore; readonly registry: SessionRegistry; readonly now: () => number }) {}

  async run<Answer>(input: {
    readonly proof: GuestCredential; readonly lobbyId: string; readonly memberId: string;
    readonly alive: () => boolean;
    readonly apply: () => { readonly answer: Answer; readonly activity: boolean };
  }): Promise<Answer | GuestCommandFailure> {
    const now = this.options.now();
    if (now - this.#lastPrune >= 1_000) {
      for (const [id, window] of this.#windows) {
        if (!window.inFlight && window.times.every((at) => now - at >= 1_000)) this.#windows.delete(id);
      }
      this.#lastPrune = now;
    }
    const previous = this.#windows.get(input.proof.id);
    if (previous === undefined && this.#windows.size >= GUEST_COMMAND_LIMIT.maxIdentities) return { ok: false, error: "RATE_LIMITED" };
    const window = previous ?? { times: [], inFlight: false };
    window.times = window.times.filter((at) => now - at < 1_000);
    this.#windows.set(input.proof.id, window);
    if (window.inFlight || window.times.length >= GUEST_COMMAND_LIMIT.maxPerSecond) return { ok: false, error: "RATE_LIMITED" };
    window.times.push(now);
    window.inFlight = true;
    try {
      const result = await this.options.store<Answer | GuestCommandFailure>({
        proof: input.proof, lobbyId: input.lobbyId, memberId: input.memberId,
        run: () => input.alive() ? input.apply() : { answer: { ok: false, error: "UNAUTHORIZED" }, activity: false },
      });
      if (result.kind !== "authorized") return { ok: false, error: "UNAUTHORIZED" };
      this.options.registry.refreshGuest(result.session.id, result.session.expiresAt.getTime());
      return result.answer;
    } catch {
      // No retry: the engine may already have accepted a sequence before the SQL failure.
      return { ok: false, error: "UNAVAILABLE" };
    } finally { window.inFlight = false; }
  }
}
