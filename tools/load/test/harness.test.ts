import { describe, expect, it } from "vitest";
import { config, databaseName, localAdminUrl, portOf } from "../src/config";
import { assertCoverage, Samples, summary } from "../src/metrics";

describe("local load guard", () => {
  it("requires explicit local confirmation and fixes capacity", () => {
    expect(() => config({})).toThrow();
    expect(config({ LOAD_CONFIRM: "local-only" })).toMatchObject({ runners: 30, spectators: 20, port: 3420 });
    expect(() => config({ LOAD_CONFIRM: "local-only", LOAD_URL: "http://example.org" })).toThrow();
  });
  it.each([
    "postgresql://x@localhost:5433/postgres",
    "postgresql://x@localhost.evil.example:5433/postgres",
    "postgresql://x@example.org:5433/postgres",
    "postgresql://127.0.0.1:5433@evil.example/postgres",
    "postgresql://x@127.0.0.1:5433/production",
    "postgresql://x@127.0.0.1:5432/postgres",
    "postgresql://x@127.0.0.1:5433/postgres?host=evil.example",
    "postgresql://x@127.0.0.1:5433/postgres#fragment",
    "https://x@127.0.0.1:5433/postgres",
  ])("refuses unsafe database URL %s", (url) => expect(() => localAdminUrl(url)).toThrow());
  it("validates ports and generated database identifiers", () => {
    expect(portOf("3421")).toBe(3421);
    for (const port of ["0", "443", "65536", "3420abc", "3e3"]) expect(() => portOf(port)).toThrow();
    expect(databaseName("incision_load_1792497600000_abcdef123456")).toContain("incision_load_");
    for (const name of ["postgres", "incision_e2e", "incision_load_test", 'x"; drop database postgres;--']) {
      expect(() => databaseName(name)).toThrow();
    }
  });
});

describe("measurement integrity", () => {
  it("uses nearest rank percentiles without mutating samples", () => {
    const values = [5, 1, 4, 2, 3];
    expect(summary(values)).toEqual({ count: 5, median: 3, p95: 5, p99: 5, max: 5 });
    expect(values).toEqual([5, 1, 4, 2, 3]);
    expect(summary(Array.from({ length: 100 }, (_, i) => i + 1))).toMatchObject({ median: 50, p95: 95, p99: 99 });
    expect(summary([]).p95).toBeNull();
    expect(() => summary([NaN])).toThrow();
  });
  it("bounds sample memory and rejects bad values", () => {
    const samples = new Samples();
    expect(() => samples.add(-1)).toThrow();
    for (let i = 0; i < 100_000; i++) samples.add(i);
    expect(() => samples.add(1)).toThrow();
  });
  it("cannot pass without all runners, spectators, acknowledgements and saved results", () => {
    const good = { runners: 30, spectators: 20, finished: 30, stored: 30, observing: 20, acknowledged: 300, expected: 300, errors: 0, disconnects: 0 };
    expect(() => assertCoverage(good)).not.toThrow();
    for (const bad of [{ finished: 29 }, { stored: 29 }, { observing: 19 }, { acknowledged: 299 }, { expected: 0 }, { errors: 1 }, { disconnects: 1 }]) {
      expect(() => assertCoverage({ ...good, ...bad })).toThrow();
    }
  });
});
