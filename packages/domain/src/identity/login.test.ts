import { describe, expect, it } from "vitest";
import { parseLogin } from "./login";

describe("parseLogin", () => {
  it("keeps the typed form and derives a lowercase canonical key", () => {
    expect(parseLogin("  Demo_Player-1 ")).toEqual({ ok: true, value: { login: "Demo_Player-1", canonical: "demo_player-1" } });
  });

  it("gives the same canonical key regardless of case", () => {
    expect(parseLogin("ALICE")).toEqual({ ok: true, value: { login: "ALICE", canonical: "alice" } });
    expect(parseLogin("alice")).toEqual({ ok: true, value: { login: "alice", canonical: "alice" } });
  });

  it("accepts the 3 and 32 character bounds", () => {
    expect(parseLogin("abc")).toMatchObject({ ok: true });
    expect(parseLogin("a".repeat(32))).toMatchObject({ ok: true });
  });

  it.each(["ab", "a".repeat(33), "with space", "émile", "a@b", "", "   "])("rejects %j", (input) => {
    expect(parseLogin(input)).toEqual({ ok: false, error: "INVALID_LOGIN" });
  });
});
