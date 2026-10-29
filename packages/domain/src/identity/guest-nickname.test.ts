import { describe, expect, it } from "vitest";
import { canonicalDisplayName, parseDisplayName } from "./display-name";
import { parseGuestNickname } from "./guest-nickname";
import { humanSubjectKey } from "./human-subject";

describe("guest nicknames", () => {
  it.each(["ab", "a".repeat(21), "", "\ud800abc", "\u0301abc", "a\u200db", "a\ufe0fb", "a\u2800b", "a\ue000b"])("refuses invalid %j", (input) => {
    expect(parseGuestNickname(input)).toEqual({ ok: false, error: "INVALID_GUEST_NICKNAME" });
  });

  it.each(["abc", "a".repeat(20), "😀😀😀", "😀".repeat(20), "аbc", "İan"])("accepts %j by code points", (input) => {
    expect(parseGuestNickname(input)).toEqual({ ok: true, value: input });
  });

  it("normalises before measuring and preserves accents in canonical names", () => {
    expect(parseGuestNickname("  Ａ  e\u0301  ")).toEqual({ ok: true, value: "A é" });
    expect(parseGuestNickname("ﬃ")).toEqual({ ok: true, value: "ffi" });
    expect(parseGuestNickname("ﬃ".repeat(7))).toMatchObject({ ok: false });
    expect(canonicalDisplayName(" ÉVA ")).toBe(canonicalDisplayName("e\u0301va"));
    expect(canonicalDisplayName("Éva")).not.toBe(canonicalDisplayName("Eva"));
    expect(canonicalDisplayName("İan")).toBe("i\u0307an");
  });

  it("does not narrow account display names or conflate identity kinds", () => {
    expect(parseDisplayName("a")).toMatchObject({ ok: true });
    expect(parseDisplayName("a".repeat(40))).toMatchObject({ ok: true });
    expect(humanSubjectKey({ kind: "account", accountId: "same" })).not.toBe(
      humanSubjectKey({ kind: "guest", guestSessionId: "same" }),
    );
  });
});
