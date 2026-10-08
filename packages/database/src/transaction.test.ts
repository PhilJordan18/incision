import { describe, expect, it } from "vitest";
import { QUERY_TIMEOUT_MS } from "./pool";
import { SERVER_LIMITS_MS } from "./transaction";

describe("SERVER_LIMITS_MS", () => {
  it("ends every server-side wait before the client's own timeout", () => {
    for (const limit of Object.values(SERVER_LIMITS_MS)) {
      expect(limit).toBeLessThan(QUERY_TIMEOUT_MS);
    }
  });
});
