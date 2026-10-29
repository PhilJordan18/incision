import type { GuestDepartureInput, GuestDepartureResult } from "@incision/database";
import { RESUME_GRACE_MS } from "@incision/domain";
import type { Schedule } from "../races/race-lease";

type Member = { readonly lobbyId: string; readonly memberId: string };
type Loss = Member & { readonly since: number; cancel?: () => void; flight?: Promise<void>; claimed: boolean; departed: boolean; again: boolean };
export type GuestGraceOptions = {
  readonly now: () => number;
  readonly schedule: Schedule;
  readonly online: (member: Member) => boolean;
  readonly end: (input: GuestDepartureInput) => Promise<GuestDepartureResult>;
  readonly departed: (member: Member) => void;
  readonly failed: () => void;
};

/** Single-process presence coordinator (ADR-0001), only fed server-verified guests. */
export class GuestPresenceGrace {
  #stopped = false;
  readonly #losses = new Map<string, Loss>();
  constructor(readonly options: GuestGraceOptions) {}

  lost(member: Member): void {
    if (this.#stopped || this.options.online(member) || this.#losses.has(member.memberId)) return;
    const loss: Loss = { ...member, since: this.options.now(), claimed: false, departed: false, again: false };
    this.#losses.set(member.memberId, loss);
    // Read SQL now: expired identities get no new grace, hosts are excluded there.
    void this.#check(loss);
  }

  /** Call before adding the returning socket to presence. A claimed SQL departure wins. */
  async resume(member: Member): Promise<boolean> {
    const loss = this.#losses.get(member.memberId);
    if (loss === undefined) return true;
    if (!loss.claimed && this.options.now() <= loss.since + RESUME_GRACE_MS) {
      this.#forget(loss);
      return true;
    }
    // An earlier read may have sampled the pre-deadline state. Wait for it, then
    // make a fresh decision before admitting a late reconnect.
    if (loss.flight !== undefined) await loss.flight;
    await this.#check(loss);
    if (loss.departed) return false;
    // A failure cannot authorize a late reconnect before its departure is decided.
    if (this.#losses.get(member.memberId) === loss && loss.claimed) return false;
    this.#forget(loss);
    return true;
  }

  changed(lobbyId: string): void {
    for (const loss of this.#losses.values()) if (loss.lobbyId === lobbyId) void this.#check(loss);
  }

  #forget(loss: Loss): void {
    loss.cancel?.();
    if (this.#losses.get(loss.memberId) === loss) this.#losses.delete(loss.memberId);
  }

  #later(loss: Loss, at: number): void {
    loss.cancel?.();
    loss.cancel = this.options.schedule(() => {
      if (this.#losses.get(loss.memberId) === loss) void this.#check(loss);
    }, Math.max(1, at - this.options.now()));
  }

  #check(loss: Loss): Promise<void> {
    if (loss.flight !== undefined) { loss.again = true; return loss.flight; }
    if (this.#losses.get(loss.memberId) !== loss) return Promise.resolve();
    loss.cancel?.();
    loss.again = false;
    loss.flight = this.#settle(loss).finally(() => {
      loss.flight = undefined;
      if (loss.again && this.#losses.get(loss.memberId) === loss) void this.#check(loss);
    });
    return loss.flight;
  }

  async #settle(loss: Loss): Promise<void> {
    try {
      const result = await this.options.end({ lobbyId: loss.lobbyId, memberId: loss.memberId, claim: (state) => {
        if (this.#losses.get(loss.memberId) !== loss || this.options.online(loss)) return false;
        if (!state.expired && this.options.now() <= loss.since + RESUME_GRACE_MS) return false;
        loss.claimed = true;
        return true;
      } });
      if (this.#losses.get(loss.memberId) !== loss) return;
      if (result.kind === "departed" || result.kind === "gone") {
        loss.departed = true;
        this.#forget(loss);
        if (result.kind === "departed") this.options.departed(loss);
      } else if (result.kind === "host") {
        this.#forget(loss); // #36C2 owns hosts; never apply the non-host policy.
      } else {
        loss.claimed = false;
        // A loss begun in racing keeps its original instant across results. While
        // racing, wait for a phase notification or identity expiry, never restart grace.
        const graceAt = loss.since + RESUME_GRACE_MS + 1; // D-06 includes equality.
        const at = result.phase === "waiting" || result.phase === "results"
          ? Math.min(graceAt, result.expiresAt) : result.expiresAt;
        this.#later(loss, at);
      }
    } catch {
      if (this.#losses.get(loss.memberId) !== loss) return;
      // Block reconnect until the failed transactional decision can be retried.
      loss.claimed = true;
      this.options.failed();
      this.#later(loss, this.options.now() + 1_000);
    }
  }

  stop(): void {
    this.#stopped = true;
    for (const loss of this.#losses.values()) loss.cancel?.();
    this.#losses.clear();
  }
}
