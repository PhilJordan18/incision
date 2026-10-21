import { expect, it } from "vitest";
import { BonusActivationLimiter } from "./bonus-limiter";

it("fails closed at capacity without evicting another account's active budget", () => {
  let now = 0;
  const limiter = new BonusActivationLimiter(() => now, 2);
  for (let i = 0; i < 5; i++) expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("b")).toBe(true);
  for (let i = 0; i < 20; i++) expect(limiter.allow(`new-${i}`)).toBe(false);
  expect(limiter.allow("a")).toBe(false);
  expect(limiter.allow("b")).toBe(true);
  now = 999;
  expect(limiter.allow("c")).toBe(false);
  now = 1000;
  expect(limiter.allow("c")).toBe(true);
  expect(limiter.allow("a")).toBe(true);
});

it("uses a sliding second rather than resetting at a fixed window boundary", () => {
  let now = 0;
  const limiter = new BonusActivationLimiter(() => now);
  expect(limiter.allow("a")).toBe(true);
  now = 999;
  for (let i = 0; i < 4; i++) expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("a")).toBe(false);
  now = 1000;
  expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("a")).toBe(false);
  now = 1999;
  for (let i = 0; i < 4; i++) expect(limiter.allow("a")).toBe(true);
  expect(limiter.allow("a")).toBe(false);
});
