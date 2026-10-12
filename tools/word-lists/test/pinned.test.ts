import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PINNED_INPUTS, readPinned } from "../src/pinned";

describe("readPinned", () => {
  const raw = mkdtempSync(join(tmpdir(), "pinned-"));
  writeFileSync(join(raw, "list"), "maison\n");
  const sha = createHash("sha256").update("maison\n").digest("hex");

  it("returns a file whose SHA-256 is the pinned one", () => {
    expect(readPinned(raw, "list", { list: sha }).toString()).toBe("maison\n");
  });

  it("fails closed on a different file or an unpinned path", () => {
    expect(() => readPinned(raw, "list", { list: "0".repeat(64) })).toThrow(/differs from the pinned/);
    expect(() => readPinned(raw, "other", { list: sha })).toThrow(/not a pinned input/);
  });

  it("pins the four inputs the report reads", () => {
    expect(Object.keys(PINNED_INPUTS).sort()).toEqual(["ldnoobw-5faf2ba/en", "ldnoobw-5faf2ba/fr", "wordfreq-3.1.1/wordfreq/data/large_en.msgpack.gz", "wordfreq-3.1.1/wordfreq/data/large_fr.msgpack.gz"]);
    expect(Object.values(PINNED_INPUTS).every((hash) => /^[0-9a-f]{64}$/.test(hash))).toBe(true);
  });
});
