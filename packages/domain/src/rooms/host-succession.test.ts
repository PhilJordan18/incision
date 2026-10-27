import { describe, expect, it } from "vitest";
import { selectHostSuccessor, type HostCandidate } from "./host-succession";

const EPOCH = 1_793_000_000_000_000;
function human(memberId: string, age: number, changes: Partial<HostCandidate> = {}): HostCandidate {
  return { memberId, joinedAtMicros: EPOCH + age, kind: "account", active: true, connected: true, ...changes };
}
const select = (members: readonly HostCandidate[]) => selectHostSuccessor({ outgoingHostId: "host", members });

it("chooses the oldest eligible human even when only a microsecond separates arrivals", () => {
  expect(select([human("new", 2), human("old", 1), human("host", 0)])).toBe("old");
});
it("allows a guest to inherit before a newer account, without requiring a participant role", () => {
  // No participant/spectator field exists: either human role may inherit (D-03).
  expect(select([human("account", 2), human("guest", 1, { kind: "guest" })])).toBe("guest");
});
it.each([
  { kind: "bot" as const }, { active: false }, { connected: false },
])("excludes an older ineligible member: %j", changes => {
  expect(select([human("excluded", 0, changes), human("eligible", 1)])).toBe("eligible");
});
it("excludes the outgoing host even if its presence snapshot still says connected", () => {
  expect(select([human("host", 0), human("next", 1)])).toBe("next");
});
it("returns no successor with no remaining connected humans", () => {
  expect(select([])).toBeUndefined();
  expect(select([human("host", 0), human("bot", 1, { kind: "bot" }), human("gone", 2, { connected: false })])).toBeUndefined();
});
it("is independent of snapshot order, including tied arrival times", () => {
  const members = [human("z", 1), human("a", 1), human("guest", 2, { kind: "guest" })];
  for (const a of members) for (const b of members) for (const c of members) {
    if (new Set([a.memberId, b.memberId, c.memberId]).size === 3) expect(select([a, b, c])).toBe("a");
  }
});
it("does not sort, mutate or retain the caller's frozen snapshot", () => {
  const members = Object.freeze([Object.freeze(human("new", 2)), Object.freeze(human("old", 1))]);
  expect(select(members)).toBe("old");
  expect(members.map(member => member.memberId)).toEqual(["new", "old"]);
  expect(select([human("other", 3)])).toBe("other");
});
describe("invalid server snapshots fail instead of accidentally closing or transferring a room", () => {
  it.each([NaN, Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("refuses invalid join time %s", joinedAtMicros => {
    expect(() => select([human("a", 0, { joinedAtMicros })])).toThrow(RangeError);
  });
  it.each(["", " ", "bad/id", "a".repeat(65)])("refuses invalid member id %s", memberId => {
    expect(() => select([human(memberId, 0)])).toThrow(RangeError);
    expect(() => selectHostSuccessor({ outgoingHostId: memberId, members: [] })).toThrow(RangeError);
  });
  it("validates ineligible members too and catches duplicates after a valid candidate", () => {
    expect(() => select([human("ok", 1), human("bad", 0, { kind: "bot", joinedAtMicros: NaN })])).toThrow(RangeError);
    expect(() => select([human("same", 0), human("same", 1)])).toThrow(RangeError);
  });
});
