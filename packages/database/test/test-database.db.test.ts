import { describe, expect, it } from "vitest";
import { localTestServerUrl } from "./test-database";

describe("localTestServerUrl", () => {
  it.each(["postgresql://u:p@localhost:5433/postgres", "postgresql://u:p@127.0.0.1/postgres", "postgresql://u:p@[::1]:5433/postgres"])(
    "accepts the local server %s",
    (url) => {
      expect(localTestServerUrl(url).toString()).toBe(new URL(url).toString());
    },
  );

  it.each([
    undefined,
    "",
    "postgresql://u:p@db.example.invalid/postgres",
    "postgresql://u:p@localhost:5433/postgres?host=db.example.invalid",
    "postgresql://u:p@localhost:5433/postgres?hostaddr=10.0.0.1",
    "postgresql://u:p@localhost/postgres?port=6543",
  ])("refuses %j", (url) => {
    expect(() => localTestServerUrl(url)).toThrow(/TEST_DATABASE_URL/);
  });
});
