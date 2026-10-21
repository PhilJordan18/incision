import { expect, it } from "vitest";
import { isBonusKeyIntent } from "./bonus-key-intent";

const input = { key: "Enter", repeat: false, isComposing: false, context: {
  typingFieldFocused: true, dialogOpen: false, controlling: true, racing: true, enabled: true,
} };
it("accepts only an intentional Enter in the active typing field", () => {
  expect(isBonusKeyIntent(input)).toBe(true);
});
it.each([{ key: "a" }, { repeat: true }, { isComposing: true }, { keyCode: 229 }, { modified: true }])(
  "ignores key/input-method guard %j", change => expect(isBonusKeyIntent({ ...input, ...change })).toBe(false),
);
it.each([
  { typingFieldFocused: false }, { dialogOpen: true }, { controlling: false }, { racing: false }, { enabled: false },
])("ignores inactive context %j", change => {
  expect(isBonusKeyIntent({ ...input, context: { ...input.context, ...change } })).toBe(false);
});
