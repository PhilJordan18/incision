import { describe, expect, it } from "vitest";
import { FIRST_VIEW, isStaleRefusal, nextHostRoundView } from "./host-round-view";

describe("the host's actions view", () => {
  it("keeps the latest answer only, and numbers each so a repeated refusal is a new alert", () => {
    const refused = nextHostRoundView(FIRST_VIEW, "RATE_LIMITED");
    const again = nextHostRoundView(refused, "RATE_LIMITED");
    expect(again).toEqual({ error: "RATE_LIMITED", attempt: 2 });
    expect(again.attempt).not.toBe(refused.attempt);
    // A newer refusal replaces an older one, and a success clears it.
    expect(nextHostRoundView(again, "ROOM_RACING")).toEqual({ error: "ROOM_RACING", attempt: 3 });
    expect(nextHostRoundView(again, undefined)).toEqual({ error: undefined, attempt: 3 });
  });

  it("reloads the page from the server only for refusals that mean it is late", () => {
    expect(isStaleRefusal("NOT_IN_A_ROOM")).toBe(true);
    expect(isStaleRefusal("NOT_ON_RESULTS")).toBe(true);
    for (const error of ["NOT_HOST", "ROOM_RACING", "RATE_LIMITED", "UNAVAILABLE", undefined] as const) {
      expect(isStaleRefusal(error)).toBe(false);
    }
  });
});
