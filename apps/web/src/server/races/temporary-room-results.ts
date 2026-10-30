import type { EntrantResult, RaceOwnership, RaceResultRow, RaceResultView, RoomSnapshot, StartedEntrant } from "@incision/database";

type Display = { readonly raceId: string; readonly entrants: Map<number, { memberId: string | null; result?: EntrantResult }> };

/** Process-local display data, never a history or an authorization source (D-08). */
export class TemporaryRoomResults {
  readonly #rooms = new Map<string, Display>();

  save(input: { readonly ownership: RaceOwnership; readonly entrants: readonly StartedEntrant[]; readonly results: readonly RaceResultRow[] }): void {
    if (!input.entrants.some((entrant) => entrant.kind !== "bot" && entrant.accountId === null)) return;
    const temporary = !input.entrants.some((entrant) => entrant.accountId !== null);
    const results = new Map(input.results.map((result) => [result.entrantId, result]));
    const entrants: Display["entrants"] = new Map();
    for (const entrant of input.entrants) {
      const row = results.get(entrant.entrantId);
      if (row === undefined) throw new Error("Missing temporary display result");
      entrants.set(entrant.ordinal, {
        memberId: entrant.accountId === null && entrant.kind !== "bot" ? entrant.memberId : null,
        ...(temporary ? { result: {
          outcome: row.outcome, abandonmentReason: row.abandonmentReason ?? null,
          rank: row.rank, elapsedMs: row.elapsedMs, position: row.position, length: row.length,
          netWpm: row.netWpm, rawWpm: row.rawWpm, accuracy: row.accuracy,
          errors: row.totalInputs - row.correctInputs,
          ...("unavailable" in row.wpmSeries ? {} : { wpmSeries: structuredClone(row.wpmSeries) }),
        } } : {}),
      });
    }
    // No cookie, account ID, nickname, private key errors or cross-race identity.
    this.#rooms.set(input.ownership.lobbyId, { raceId: input.ownership.raceId, entrants });
  }

  /** Caller MUST obtain this view through a current authorized room-results SQL read. */
  apply(lobbyId: string, view: RaceResultView, guestMemberId?: string): RaceResultView {
    const display = this.#rooms.get(lobbyId);
    if (display?.raceId !== view.raceId || view.state !== "finished") return view;
    return { ...view, entrants: view.entrants.map((entrant) => {
      const live = display.entrants.get(entrant.ordinal);
      return { ...entrant,
        ...(guestMemberId === undefined ? {} : { isSelf: live?.memberId === guestMemberId }),
        ...(live?.result === undefined ? {} : { result: structuredClone(live.result) }),
      };
    }).sort((a, b) => (a.result?.rank ?? Infinity) - (b.result?.rank ?? Infinity) || a.ordinal - b.ordinal) };
  }

  forgetMember(lobbyId: string, memberId: string): void {
    for (const entrant of this.#rooms.get(lobbyId)?.entrants.values() ?? []) {
      if (entrant.memberId === memberId) entrant.memberId = null;
    }
  }

  /** A delayed read cannot erase a newer display. Unverifiable displays are evicted. */
  async reconcile(lobbyId: string, read: () => Promise<Pick<RoomSnapshot, "phase" | "race"> | undefined>): Promise<void> {
    const display = this.#rooms.get(lobbyId);
    if (display === undefined) return;
    let room: Awaited<ReturnType<typeof read>>;
    try { room = await read(); }
    catch (error: unknown) {
      // Privacy-first failure bound: no stale member mapping waits indefinitely
      // for another notification. Never invent/recover missing ephemeral results.
      if (this.#rooms.get(lobbyId) === display) this.#rooms.delete(lobbyId);
      throw error;
    }
    if (this.#rooms.get(lobbyId) === display &&
      (room?.phase !== "results" || room.race?.raceId !== display.raceId)) this.#rooms.delete(lobbyId);
  }

  discard(lobbyId: string): void { this.#rooms.delete(lobbyId); }

  clear(): void { this.#rooms.clear(); }
}

const shared = globalThis as typeof globalThis & { incisionTemporaryResults?: TemporaryRoomResults };
export function temporaryRoomResults(): TemporaryRoomResults {
  return shared.incisionTemporaryResults ??= new TemporaryRoomResults();
}
