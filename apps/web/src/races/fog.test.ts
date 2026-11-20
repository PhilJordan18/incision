import { expect, it } from "vitest";
import { toGraphemes } from "@incision/domain";
import { fogStartsAt } from "./fog";

it.each([[0, 4], [1, 4], [3, 4], [4, 9], [8, 9], [9, 12], [12, 12]])(
  "preserves the current token and separator at position %i", (position, expected) => {
    expect(fogStartsAt([..."sea port mer"], position)).toBe(expected);
  },
);
it("counts graphemes, not UTF-16, and has no hidden suffix at the end", () => {
  const target = toGraphemes("é 👩‍✈️ mer");
  expect(fogStartsAt(target, 2)).toBe(4);
  expect(fogStartsAt(target, target.length)).toBe(target.length);
});
