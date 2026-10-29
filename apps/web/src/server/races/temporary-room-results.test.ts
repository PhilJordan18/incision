import type { RaceOwnership, RaceResultRow, RaceResultView, StartedEntrant } from "@incision/database";
import { describe, expect, it } from "vitest";
import { TemporaryRoomResults } from "./temporary-room-results";
const ownership: RaceOwnership = { lobbyId: "room", raceId: "race", ownerId: "owner", ownerEpoch: 1 };
const entrants: StartedEntrant[] = [{ entrantId: "entrant", memberId: "member", accountId: null, ordinal: 1, displayName: "Private nickname", kind: "human" }];
const results: RaceResultRow[] = [{ entrantId: "entrant", outcome: "finished", rank: 1, elapsedMs: 1000, position: 1, length: 1,
  correctInputs: 1, totalInputs: 1, netWpm: 12, rawWpm: 12, accuracy: 100, wpmSeries: { unavailable: "not_collected" },
  keyErrors: { version: 1, keys: [{ grapheme: "PRIVATE", count: 1 }] } }];
const view: RaceResultView = { raceId: "race", roundNo: 1, state: "finished", interruptionReason: null,
  countdownAt: new Date(0), startedAt: new Date(0), endedAt: new Date(1000),
  entrants: [{ ordinal: 1, displayName: "#1", kind: "human", anonymous: true, isSelf: false }] };
function setup() { const cache = new TemporaryRoomResults(); cache.save({ ownership, entrants, results }); return cache; }

describe("temporary room results", () => {
  it("projects measures and current guest self without a nickname, account history or private key errors", () => {
    const cache = setup(); const shown = cache.apply("room", view, "member");
    expect(shown.entrants[0]).toMatchObject({ isSelf: true, result: { rank: 1, errors: 0 } });
    expect(shown.personalRecord).toBeUndefined(); expect(shown.personalKeyErrors).toBeUndefined();
    expect(JSON.stringify(shown)).not.toContain("Private nickname"); expect(JSON.stringify(shown)).not.toContain("PRIVATE");
    expect(cache.apply("other", view, "member")).toBe(view);
    expect(cache.apply("room", { ...view, raceId: "other" }, "member").entrants[0]?.result).toBeUndefined();
  });
  it("forgets a leaver's self mapping; a new membership never inherits it", () => {
    const cache = setup(); cache.forgetMember("room", "member");
    expect(cache.apply("room", view, "member").entrants[0]?.isSelf).toBe(false);
    expect(cache.apply("room", view, "new-member").entrants[0]?.isSelf).toBe(false);
    expect(cache.apply("room", view).entrants[0]?.result).toBeDefined();
  });
  it("does not overwrite durable account-race results", () => {
    const cache = new TemporaryRoomResults();
    cache.save({ ownership, entrants: [...entrants, { ...entrants[0]!, entrantId: "account-entrant", accountId: "account", ordinal: 2 }],
      results: [...results, { ...results[0]!, entrantId: "account-entrant", rank: 2 }] });
    expect(cache.apply("room", view, "member").entrants[0]).toMatchObject({ isSelf: true });
    expect(cache.apply("room", view, "member").entrants[0]?.result).toBeUndefined();
  });
  it("erases after the room stops displaying the race and after explicit closure", async () => {
    const cache = setup(); await cache.reconcile("room", async () => ({ phase: "waiting" }));
    expect(cache.apply("room", view)).toBe(view);
    cache.save({ ownership, entrants, results }); cache.discard("room"); expect(cache.apply("room", view)).toBe(view);
  });
  it("cannot erase a newer race with a stale asynchronous cleanup", async () => {
    const cache = setup(); let release = () => {};
    const pending = new Promise<void>((resolve) => { release = resolve; });
    const cleanup = cache.reconcile("room", async () => { await pending; return undefined; });
    cache.save({ ownership: { ...ownership, raceId: "new-race" }, entrants, results }); release(); await cleanup;
    expect(cache.apply("room", { ...view, raceId: "new-race" }).entrants[0]?.result).toBeDefined();
  });
  it("does not expose mutable cache references", () => {
    const cache = setup(); const first = cache.apply("room", view);
    expect(cache.apply("room", view).entrants[0]?.result).not.toBe(first.entrants[0]?.result);
    cache.clear(); expect(cache.apply("room", view)).toBe(view);
  });
});
