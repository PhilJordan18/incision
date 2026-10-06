import { describe, expect, it, vi } from "vitest";
import { usesVerifiedTls } from "./tls";

const base = "postgresql://user:secret@db.example/incision";

describe("usesVerifiedTls", () => {
  // pg-connection-string warns about future `require` semantics on every parse.
  vi.spyOn(console, "warn").mockImplementation(() => undefined);

  it.each(["sslmode=verify-full", "sslmode=require", "sslmode=require&channel_binding=require"])(
    "accepts %s",
    (query) => {
      expect(usesVerifiedTls(`${base}?${query}`)).toBe(true);
    },
  );

  it.each([
    "",
    "?sslmode=disable",
    "?sslmode=no-verify",
    "?sslmode=verify-full&sslmode=disable",
    "?sslmode=require&uselibpqcompat=true",
    // Misspelled parameter: pg ignores it and would connect in clear text.
    "?ssl_mode=require",
  ])("refuses %j", (query) => {
    expect(usesVerifiedTls(`${base}${query}`)).toBe(false);
  });
});
