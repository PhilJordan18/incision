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
    const env = parseServerEnv({
      NODE_ENV: "production",
      PORT: "8080",
      APP_URL: "https://incision.example/path",
      DATABASE_URL: "postgresql://db.example/incision?sslmode=verify-full",
    });
    expect(env).toMatchObject({ isProduction: true, port: 8080, appOrigin: "https://incision.example" });
  });

  it("requires APP_URL and DATABASE_URL in production", () => {
    expect(() =>
      parseServerEnv({ NODE_ENV: "production", DATABASE_URL: "postgresql://db.example/x?sslmode=require" }),
    ).toThrow(/APP_URL/);
    expect(() => parseServerEnv({ NODE_ENV: "production", APP_URL: "https://incision.example" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("accepts Neon's default production URL (sslmode=require with channel binding)", () => {
    const env = parseServerEnv({
      NODE_ENV: "production",
      APP_URL: "https://incision.example",
      DATABASE_URL: "postgresql://user:secret@ep-example-pooler.neon.tech/neondb?sslmode=require&channel_binding=require",
    });
    expect(env.isProduction).toBe(true);
  });

  it.each([
    "postgresql://db.example/x",
    "postgresql://db.example/x?ssl_mode=require",
    "postgresql://db.example/x?sslmode=disable",
    "postgresql://db.example/x?sslmode=verify-full&sslmode=disable",
    "not a url",
  ])(
    "requires TLS for the production database (%s)",
    (databaseUrl) => {
      expect(() =>
        parseServerEnv({ NODE_ENV: "production", APP_URL: "https://incision.example", DATABASE_URL: databaseUrl }),
      ).toThrow(/DATABASE_URL must use verified TLS/);
    },
  );

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
