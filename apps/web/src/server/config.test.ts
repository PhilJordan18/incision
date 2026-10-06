import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./config";

/** A complete production environment with placeholder values. */
const production = {
  NODE_ENV: "production",
  PORT: "8080",
  APP_URL: "https://incision.example",
  AUTH_URL: "https://incision.example",
  AUTH_SECRET: "x".repeat(44),
  DATABASE_URL: "postgresql://db.example/incision?sslmode=verify-full",
  AUTH_GITHUB_ID: "github-client-id",
  AUTH_GITHUB_SECRET: "github-client-secret",
  AUTH_DISCORD_ID: "discord-client-id",
  AUTH_DISCORD_SECRET: "discord-client-secret",
  TRUSTED_PROXY_HOPS: "1",
} as const;

describe("parseServerEnv", () => {
  it("defaults to development on port 3000 with a localhost origin", () => {
    expect(parseServerEnv({})).toEqual({
      isProduction: false,
      port: 3000,
      appOrigin: "http://localhost:3000",
      databaseUrl: undefined,
      authSecret: undefined,
      secureCookies: false,
      trustedProxyHops: 0,
    });
  });

  it("reads a complete production environment", () => {
    expect(parseServerEnv(production)).toEqual({
      isProduction: true,
      port: 8080,
      appOrigin: "https://incision.example",
      databaseUrl: production.DATABASE_URL,
      authSecret: production.AUTH_SECRET,
      secureCookies: true,
      trustedProxyHops: 1,
    });
  });

  it("keeps only the origin of APP_URL", () => {
    expect(parseServerEnv({ ...production, APP_URL: "https://incision.example/path" })).toMatchObject({
      appOrigin: "https://incision.example",
    });
  });

  it.each([
    "APP_URL",
    "AUTH_URL",
    "AUTH_SECRET",
    "DATABASE_URL",
    "AUTH_GITHUB_ID",
    "AUTH_GITHUB_SECRET",
    "AUTH_DISCORD_ID",
    "AUTH_DISCORD_SECRET",
    "TRUSTED_PROXY_HOPS",
  ] as const)("requires %s in production", (name) => {
    const env: Record<string, string | undefined> = { ...production, [name]: undefined };
    expect(() => parseServerEnv(env)).toThrow(new RegExp(`${name}: is required in production`));
  });

  it.each([
    ["another origin", "https://other.example"],
    ["another scheme", "http://incision.example"],
    ["a path", "https://incision.example/api/auth"],
  ])("requires AUTH_URL to equal APP_URL, not %s", (_label, authUrl) => {
    expect(() => parseServerEnv({ ...production, AUTH_URL: authUrl })).toThrow(/AUTH_URL: must equal APP_URL/);
  });

  it("refuses a short AUTH_SECRET or an empty provider secret", () => {
    expect(() => parseServerEnv({ ...production, AUTH_SECRET: "too-short" })).toThrow(/AUTH_SECRET: must have at least 32/);
    expect(() => parseServerEnv({ ...production, AUTH_DISCORD_SECRET: "" })).toThrow(/AUTH_DISCORD_SECRET: must not be empty/);
  });

  it("requires HTTPS in production, except for a local production build", () => {
    expect(() => parseServerEnv({ ...production, APP_URL: "http://incision.example", AUTH_URL: "http://incision.example" })).toThrow(
      /APP_URL: must use HTTPS/,
    );
    const local = parseServerEnv({ ...production, APP_URL: "http://localhost:3100", AUTH_URL: "http://localhost:3100" });
    expect(local).toMatchObject({ appOrigin: "http://localhost:3100", secureCookies: false });
  });

  it("accepts Neon's default production URL (sslmode=require with channel binding)", () => {
    const env = parseServerEnv({
      ...production,
      DATABASE_URL: "postgresql://user:secret@ep-example-pooler.neon.tech/neondb?sslmode=require&channel_binding=require",
    });
    expect(env.isProduction).toBe(true);
  });

  it("accepts a local database without TLS in production: nothing crosses the network", () => {
    expect(parseServerEnv({ ...production, DATABASE_URL: "postgresql://u:p@localhost:5432/incision_e2e" }).isProduction).toBe(true);
  });

  it.each([
    "postgresql://db.example/x",
    "postgresql://db.example/x?ssl_mode=require",
    "postgresql://db.example/x?sslmode=disable",
    "postgresql://db.example/x?sslmode=verify-full&sslmode=disable",
    "postgresql://localhost/x?host=db.example",
    "not a url",
  ])("requires TLS for a remote production database (%s)", (databaseUrl) => {
    expect(() => parseServerEnv({ ...production, DATABASE_URL: databaseUrl })).toThrow(/DATABASE_URL: must use verified TLS/);
  });

  it.each([
    { PORT: "0" },
    { PORT: "abc" },
    { APP_URL: "ftp://incision.example" },
    { NODE_ENV: "staging" },
    { TRUSTED_PROXY_HOPS: "3" },
    { TRUSTED_PROXY_HOPS: "-1" },
  ])("rejects an invalid value (%o)", (env) => {
    expect(() => parseServerEnv(env)).toThrow(/Invalid server environment/);
  });

  it("never echoes a variable's value in the error", () => {
    let message = "";
    try {
      parseServerEnv({ ...production, DATABASE_URL: "postgresql://user:hunter2@db.example/incision", APP_URL: "not a url hunter2", AUTH_SECRET: "hunter2" });
    } catch (error: unknown) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toMatch(/APP_URL/);
    expect(message).not.toContain("hunter2");
  });
});
