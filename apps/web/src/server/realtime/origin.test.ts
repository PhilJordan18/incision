import { describe, expect, it } from "vitest";
import { isAllowedHandshake } from "./origin";

const allowed = "https://incision.example";

describe("isAllowedHandshake", () => {
  it("accepts the site's own origin", () => {
    expect(isAllowedHandshake({ origin: allowed, secFetchSite: "same-origin" }, allowed)).toBe(true);
  });

  it("accepts a request without Origin: a same-origin polling GET or a non-browser client", () => {
    expect(isAllowedHandshake({ origin: undefined, secFetchSite: undefined }, allowed)).toBe(true);
    expect(isAllowedHandshake({ origin: undefined, secFetchSite: "same-origin" }, allowed)).toBe(true);
  });

  it("refuses a request marked cross-site even without Origin", () => {
    expect(isAllowedHandshake({ origin: undefined, secFetchSite: "cross-site" }, allowed)).toBe(false);
  });

  it.each([
    "",
    "null",
    "https://evil.example",
    "http://incision.example",
    "https://incision.example:8443",
    "https://incision.example.evil.example",
  ])("refuses the origin %j", (origin) => {
    expect(isAllowedHandshake({ origin, secFetchSite: undefined }, allowed)).toBe(false);
  });
});
