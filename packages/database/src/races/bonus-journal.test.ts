import { describe, expect, it } from "vitest";
import { checkedBonusJournal } from "./bonus-journal";

const grant = { kind: "fogLeader", milestone: 25, activation: { targetOrdinal: 2, atMs: 1234 } };
describe("final bonus journal boundary", () => {
  it("distinguishes collected empty journals from uncollected old results", () => {
    expect(checkedBonusJournal({ version: 1, grants: [] }, [1, 2]).grants).toEqual([]);
    expect(() => checkedBonusJournal(undefined, [1, 2])).toThrow();
  });
  it("retains server activation facts and unused grants", () => {
    const journal = { version: 1, grants: [grant, { kind: "shortenSelf", milestone: 50 }] };
    expect(checkedBonusJournal(journal, [1, 2])).toEqual(journal);
  });
  it.each([
    { version: 2, grants: [] }, { version: 1, grants: [grant, grant] },
    { version: 1, grants: [{ ...grant, milestone: 30 }] },
    { version: 1, grants: [{ ...grant, kind: "invented" }] },
    { version: 1, grants: [{ ...grant, cookie: "private" }] },
    { version: 1, grants: [{ ...grant, activation: { targetOrdinal: 3, atMs: 10 } }] },
    { version: 1, grants: [{ ...grant, activation: { targetOrdinal: 2, atMs: -1 } }] },
    { version: 1, grants: [{ ...grant, activation: { targetOrdinal: 2, atMs: 1.5 } }] },
    { version: 1, grants: [], random: [1, 2, 3, 4] },
  ])("rejects invalid, duplicate or identity-bearing payloads %#", (input) => {
    expect(() => checkedBonusJournal(input, [1, 2])).toThrow("Invalid bonus journal");
  });
});
