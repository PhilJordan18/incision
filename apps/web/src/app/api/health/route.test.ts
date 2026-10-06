import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as live } from "./live/route";
import { GET as readiness } from "./route";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("GET /api/health/live", () => {
  it("answers without any database configuration", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    vi.stubEnv("INCISION_DEPLOYED_COMMIT", "abc123");
    const response = live();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "ok", commit: "abc123" });
  });
});

describe("GET /api/health", () => {
  it("reports a missing database configuration as degraded, without failing", async () => {
    vi.stubEnv("DATABASE_URL", undefined);
    const response = await readiness();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "degraded", database: "not_configured" });
  });

  it("reports an unreachable database as degraded, without throwing or leaking it", async () => {
    vi.stubEnv("DATABASE_URL", "postgresql://nobody:hunter2@127.0.0.1:1/none");
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const response = await readiness();
    const body: unknown = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "degraded", database: "down" });
    expect(JSON.stringify(body)).not.toContain("hunter2");
    expect(errors.mock.calls.flat().join(" ")).not.toContain("hunter2");
    errors.mockRestore();
  });
});
