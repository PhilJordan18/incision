/**
 * The pinned raw inputs (see README): each file is checked against its SHA-256 before it is read,
 * so a swapped or tampered download fails closed instead of being decoded.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

export const PINNED_INPUTS: Readonly<Record<string, string>> = {
  "wordfreq-3.1.1/wordfreq/data/large_fr.msgpack.gz": "6f16cd80b9b66c5698ed002becea83ae30d0584c3205f1cf01714ad562c00c8b",
  "wordfreq-3.1.1/wordfreq/data/large_en.msgpack.gz": "dffae8066b78dce0a6667cf5f58e567054f902674667090a7ac8a8a44628b05c",
  "ldnoobw-5faf2ba/fr": "79763a705e08256b393952852bb63aa903f4485e0ef02f70735f5e50efff213c",
  "ldnoobw-5faf2ba/en": "af851ecef1d5f212caba17339b12ac39cc2fef7d78c74876f67237644fcee8bd",
};

/** Reads a pinned input under `rawDir`; throws unless its SHA-256 is the pinned one. */
export function readPinned(rawDir: string, relativePath: string, pins: Readonly<Record<string, string>> = PINNED_INPUTS): Buffer {
  const expected = pins[relativePath];
  if (expected === undefined) {
    throw new Error(`${relativePath} is not a pinned input`);
  }
  const content = readFileSync(join(rawDir, relativePath));
  const actual = createHash("sha256").update(content).digest("hex");
  if (actual !== expected) {
    throw new Error(`${relativePath}: SHA-256 ${actual} differs from the pinned ${expected}`);
  }
  return content;
}
