import { INTERRUPTION_REASONS as STORED_REASONS, RACE_STATES as STORED_STATES } from "@incision/database";
import { describe, expect, it } from "vitest";
import { INTERRUPTION_REASONS, RACE_STATES } from "./protocol";

describe("room snapshot schema", () => {
  it("knows exactly the race states and interruption reasons the database stores", () => {
    // The browser cannot import the database package: its copy must never drift.
    expect(RACE_STATES).toEqual(STORED_STATES);
    expect(INTERRUPTION_REASONS).toEqual(STORED_REASONS);
  });
});
