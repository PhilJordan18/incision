import { describe, expect, it } from "vitest";
import { parseModerationForm } from "./moderation-form";

const memberId = "abcdefab-1234-4567-89ab-abcdefabcdef";
function form() {
  const data = new FormData();
  for (const [key, value] of Object.entries({ code: "ABCDEF", memberId, revision: "12" })) {
    data.set(key, value);
  }
  return data;
}

describe("moderation form", () => {
  it("normalizes the target UUID and parses revision bounds", () => {
    for (const revision of ["0", "2147483646"]) {
      const data = form();
      data.set("memberId", memberId.toUpperCase());
      data.set("revision", revision);
      expect(parseModerationForm(data)).toEqual({ code: "ABCDEF", memberId, revision: Number(revision) });
    }
  });
  it.each(["code", "memberId", "revision"])("rejects missing, duplicate and file-valued %s", (key) => {
    const data = form();
    data.append(key, "other");
    expect(parseModerationForm(data)).toBeUndefined();
    data.delete(key);
    expect(parseModerationForm(data)).toBeUndefined();
    data.set(key, new Blob(["invalid"]), "input.txt");
    expect(parseModerationForm(data)).toBeUndefined();
  });
  it.each(["", "-1", "2147483647", "99999999999", "1.5", "1e2", "+1", " 1", "NaN"])("rejects revision %s", (revision) => {
    const data = form();
    data.set("revision", revision);
    expect(parseModerationForm(data)).toBeUndefined();
  });
  it.each(["", "account-id", "abcdefab-1234-4567-89ab-abcdefabcdeg"])("rejects target %s", (target) => {
    const data = form();
    data.set("memberId", target);
    expect(parseModerationForm(data)).toBeUndefined();
  });
  it("rejects an invalid room code", () => {
    const data = form();
    data.set("code", "not-a-room");
    expect(parseModerationForm(data)).toBeUndefined();
  });
  it("does not accept client-supplied authority or target identity", () => {
    const data = form();
    data.set("isHost", "true");
    data.set("accountId", memberId);
    data.set("guestSessionId", memberId);
    expect(parseModerationForm(data)).toEqual({ code: "ABCDEF", memberId, revision: 12 });
  });
});
