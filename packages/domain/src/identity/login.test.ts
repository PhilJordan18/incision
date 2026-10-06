import { describe, expect, it } from "vitest";
import { parseLogin } from "./login";

describe("parseLogin", () => {
  it("keeps the typed form and derives a lowercase canonical key", () => {
    expect(parseLogin("  Demo_Player-1 ")).toEqual({ ok: true, value: { login: "Demo_Player-1", canonical: "demo_player-1" } });
  });

  it("gives the same canonical key regardless of case", () => {
    const upper = parseLogin("ALICE");
    const lower = parseLogin("alice");
    expect(upper.ok && lower.ok && upper.value.canonical === lower.value.canonical).toBe(true);
  });

  it.each(["ab", "a".repeat(33), "with space", "émile", "a@b", "", "   "])("rejects %j", (input) => {
    expect(parseLogin(input)).toEqual({ ok: false, error: "INVALID_LOGIN" });
  });
});
