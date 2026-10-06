import { describe, expect, it, vi } from "vitest";
import { assertMigrationTarget } from "./migration-target";

describe("assertMigrationTarget", () => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  it.each([
    "postgresql://u:p@localhost:5432/incision",
    "postgresql://u:p@[::1]:5432/incision",
    "postgresql://u:p@ep-cool-1.ca-central-1.aws.neon.tech/neondb?sslmode=verify-full",
    "postgresql://u:p@ep-cool-1.ca-central-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require",
  ])("accepts %s", (url) => {
    expect(() => assertMigrationTarget(url)).not.toThrow();
  });

  it.each(["ep-cool-1-pooler.neon.tech", "EP-COOL-1-POOLER.neon.tech"])("refuses the pooled Neon endpoint %s", (host) => {
    expect(() => assertMigrationTarget(`postgresql://u:p@${host}/db?sslmode=verify-full`)).toThrow(/pooled/);
  });

  it.each([
    "postgresql://u:p@db.example.com/db",
    "postgresql://u:p@db.example.com/db?sslmode=disable",
    "postgresql://u:p@localhost/db?host=db.example.com&sslmode=disable",
  ])("refuses a remote target without verified TLS: %s", (url) => {
    expect(() => assertMigrationTarget(url)).toThrow(/verified TLS/);
  });
});
