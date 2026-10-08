import { describe, expect, it } from "vitest";
import { startRefusal } from "./start";

const human = { kind: "human" } as const;
const bot = { kind: "bot" } as const;

describe("startRefusal (COURSE-02)", () => {
  it("refuses fewer than two participants", () => {
    expect(startRefusal([])).toBe("NOT_ENOUGH_PARTICIPANTS");
    expect(startRefusal([human])).toBe("NOT_ENOUGH_PARTICIPANTS");
  });

  it("refuses participants that are all bots", () => {
    expect(startRefusal([bot, bot])).toBe("NO_HUMAN_PARTICIPANT");
  });

  it("accepts one human and one bot: bots count toward the minimum", () => {
    expect(startRefusal([human, bot])).toBeUndefined();
    expect(startRefusal([bot, human])).toBeUndefined();
  });

  it("accepts two humans and a full room of thirty", () => {
    expect(startRefusal([human, human])).toBeUndefined();
    expect(startRefusal([human, ...Array.from({ length: 29 }, () => bot)])).toBeUndefined();
  });
});
