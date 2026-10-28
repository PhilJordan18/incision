import { describe, expect, it } from "vitest";
import { BOT_LEVELS } from "@incision/domain";
import { parseBotForm } from "./bot-form";

function form(kind = "add") {
  const value = new FormData();
  value.set("code", "ABCDEF"); value.set("revision", "3"); value.set("kind", kind);
  value.set("level", "beginner"); value.set("botId", "128067A1-4C21-4986-9AE8-DB7A0E451590");
  return value;
}
describe("bot form boundary", () => {
  it.each(BOT_LEVELS)("accepts the documented %s level", (level) => {
    const value = form(); value.set("level", level);
    expect(parseBotForm(value)).toEqual({ code: "ABCDEF", revision: 3, change: { kind: "add", level } });
  });
  it.each(["remove", "level"])("normalizes the target for %s", (kind) => {
    expect(parseBotForm(form(kind))?.change).toMatchObject({ kind, botId: "128067a1-4c21-4986-9ae8-db7a0e451590" });
  });
  it.each(["code", "revision", "kind", "level"])("refuses duplicate, missing and file %s", (key) => {
    for (const mode of ["duplicate", "missing", "file"]) {
      const value = form();
      if (mode === "duplicate") value.append(key, String(value.get(key)));
      else if (mode === "missing") value.delete(key);
      else value.set(key, new Blob(["payload"]), "input.txt");
      expect(parseBotForm(value)).toBeUndefined();
    }
  });
  it.each(["-1", "1e3", "2.5", "2147483647", " 3"])("refuses invalid revision %s", (revision) => {
    const value = form(); value.set("revision", revision); expect(parseBotForm(value)).toBeUndefined();
  });
  it("refuses invented levels, actions and target ids", () => {
    for (const [key, value] of [["level", "admin"], ["kind", "host"], ["botId", "../other"]]) {
      const input = form("level"); input.set(key!, value!); expect(parseBotForm(input)).toBeUndefined();
    }
  });
});
