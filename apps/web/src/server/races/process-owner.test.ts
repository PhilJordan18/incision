import { describe, expect, it } from "vitest";
import { processOwnerId } from "./process-owner";

describe("processOwnerId", () => {
  it("is a random UUID, the same for every caller of the process", () => {
    const owner = processOwnerId();
    expect(owner).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(processOwnerId()).toBe(owner);
  });

  it("is shared through the process, so another bundled copy of the module finds it", () => {
    const owner = processOwnerId();
    expect((globalThis as typeof globalThis & { incisionRaceOwnerId?: string }).incisionRaceOwnerId).toBe(owner);
  });
});
