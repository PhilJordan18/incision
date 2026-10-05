import { describe, expect, it } from "vitest";
import { isAllowedOrigin } from "./origin";

const allowed = "https://incision.example";

describe("isAllowedOrigin", () => {
  it("accepts the site's own origin", () => {
    expect(isAllowedOrigin("https://incision.example", allowed)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "null",
    "https://evil.example",
    "http://incision.example",
    "https://incision.example:8443",
    "https://incision.example.evil.example",
  ])("refuses %j", (origin) => {
    expect(isAllowedOrigin(origin, allowed)).toBe(false);
  });
});
