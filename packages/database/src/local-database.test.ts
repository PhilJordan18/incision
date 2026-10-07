import { describe, expect, it } from "vitest";
import { isLocalDatabase } from "./local-database";

describe("isLocalDatabase", () => {
  it.each(["postgresql://u:p@localhost:5432/db", "postgresql://u:p@127.0.0.1/db", "postgresql://u:p@[::1]:5433/db", "postgresql://u:p@LOCALHOST/db"])(
    "accepts %s",
    (url) => {
      expect(isLocalDatabase(url)).toBe(true);
    },
  );

  it.each([
    "postgresql://u:p@ep-cool-1.neon.tech/db",
    // pg connects to the host parameter, not to the URL's host.
    "postgresql://u:p@localhost/db?host=ep-cool-1.neon.tech",
    "postgresql://u:p@localhost./db",
    "postgresql://u:p@127.0.0.2/db",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isLocalDatabase(url)).toBe(false);
  });
});
