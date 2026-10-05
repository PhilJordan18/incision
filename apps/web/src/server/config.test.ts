import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./config";

describe("parseServerEnv", () => {
  it("defaults to development on port 3000 with a localhost origin", () => {
    expect(parseServerEnv({})).toEqual({
      isProduction: false,
      port: 3000,
      appOrigin: "http://localhost:3000",
      databaseUrl: undefined,
    });
  });

  it("keeps only the origin of APP_URL", () => {
    const env = parseServerEnv({ NODE_ENV: "production", PORT: "8080", APP_URL: "https://incision.example/path" });
    expect(env).toMatchObject({ isProduction: true, port: 8080, appOrigin: "https://incision.example" });
  });

  it("requires APP_URL in production", () => {
    expect(() => parseServerEnv({ NODE_ENV: "production" })).toThrow(/APP_URL/);
  });

  it.each([{ PORT: "0" }, { PORT: "abc" }, { APP_URL: "ftp://incision.example" }, { NODE_ENV: "staging" }])(
    "rejects an invalid value (%o)",
    (env) => {
      expect(() => parseServerEnv(env)).toThrow(/Invalid server environment/);
    },
  );

  it("never echoes a variable's value in the error", () => {
    const secret = "postgresql://user:hunter2@db.example/incision";
    let message = "";
    try {
      parseServerEnv({ DATABASE_URL: secret, APP_URL: "not a url hunter2" });
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/APP_URL/);
    expect(message).not.toContain("hunter2");
  });
});
