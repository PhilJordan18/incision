import { describe, expect, it } from "vitest";
import { FIRST_VIEW, isStaleRefusal, nextHostRoundView } from "./host-round-view";

describe("the host's actions view", () => {
  it("keeps the latest answer only, and numbers each so a repeated refusal is a new alert", () => {
    const refused = nextHostRoundView(FIRST_VIEW, "RATE_LIMITED", "next");
    const again = nextHostRoundView(refused, "RATE_LIMITED", "next");
    expect(again).toEqual({ error: "RATE_LIMITED", attempt: 2, intent: "next" });
    expect(again.attempt).not.toBe(refused.attempt);
    // A newer refusal replaces an older one, and a success clears it.
    expect(nextHostRoundView(again, "ROOM_RACING", "close")).toEqual({ error: "ROOM_RACING", attempt: 3, intent: "close" });
    expect(nextHostRoundView(again, undefined, "next")).toEqual({ error: undefined, attempt: 3, intent: "next" });
  });

  it("reloads the page from the server only for refusals that mean it is late", () => {
    expect(isStaleRefusal("NOT_IN_A_ROOM")).toBe(true);
    expect(isStaleRefusal("NOT_ON_RESULTS")).toBe(true);
    for (const error of ["NOT_HOST", "ROOM_RACING", "RATE_LIMITED", "UNAVAILABLE", undefined] as const) {
      expect(isStaleRefusal(error)).toBe(false);
    }
  });
});
