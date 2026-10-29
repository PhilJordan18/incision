import { encode } from "@msgpack/msgpack";
import { gzipSync } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { parseWordListSource } from "../../../packages/domain/src/words/data/format";
import { exportCandidate, serializeCandidate, sha256 } from "../src/candidate";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture(raw = gzipSync(encode([{ format: "cB", version: 1 }, ["sea", "boat", "SEA", "bad-word"]]))) {
  const root = mkdtempSync(join(tmpdir(), "incision-candidate-"));
  roots.push(root);
  const relative = "wordfreq-3.1.1/wordfreq/data/large_en.msgpack.gz";
  mkdirSync(join(root, "wordfreq-3.1.1/wordfreq/data"), { recursive: true });
  writeFileSync(join(root, relative), raw);
  return { root, pins: { [relative]: sha256(raw) }, options: { rawDir: root, language: "en", version: "candidate-1", outDir: join(root, "out") } };
}

describe("candidate serialization", () => {
  it("normalizes collisions, keeps the highest frequency and sorts deterministically", () => {
    const result = serializeCandidate([["Été", "e\u0301te\u0301", "mer", "aujourd'hui", "œil", "a-b", "ﬁn", "sea1", "море"], ["été", "bateau"]], "fr", "candidate-1");
    expect(parseWordListSource(result.source).entries).toEqual([
      { word: "aujourd'hui", zipf: 9 }, { word: "mer", zipf: 9 }, { word: "été", zipf: 9 }, { word: "œil", zipf: 9 }, { word: "bateau", zipf: 8.99 },
    ]);
    expect(result.counts).toEqual({ input: 11, accepted: 5, duplicates: 2, rejected: { frequency: 0, syntax: 3, alphabet: 1 } });
  });
  it("rejects out-of-range frequencies and preserves exact bin values", () => {
    const bins = Array.from({ length: 902 }, () => [] as string[]);
    bins[900] = ["sea"]; bins[901] = ["boat"];
    const result = serializeCandidate(bins, "en", "candidate-1");
    expect(parseWordListSource(result.source).entries).toEqual([{ word: "sea", zipf: 0 }]);
    expect(result.counts.rejected.frequency).toBe(1);
  });
  it.each([["de", "candidate-1"], ["en", "../bad"], ["en", ""], ["en", "a".repeat(33)]])("refuses invalid language/version %s %s", (language, version) => {
    expect(() => serializeCandidate([["sea"]], language, version)).toThrow();
  });
  it("refuses empty candidates instead of producing a vacuous success", () => {
    expect(() => serializeCandidate([["été", "123"]], "en", "candidate-1")).toThrow("No syntactically");
  });
});

describe("candidate export", () => {
  it("exports identical bytes with accurate provenance, without auxiliary dictionaries", () => {
    const { root, pins, options } = fixture();
    exportCandidate(options, pins);
    exportCandidate({ ...options, outDir: join(root, "second") }, pins);
    expect(readdirSync(options.outDir).sort()).toEqual(["NOTICE.txt", "en.words.txt", "manifest.json"]);
    for (const name of readdirSync(options.outDir)) expect(readFileSync(join(options.outDir, name))).toEqual(readFileSync(join(root, "second", name)));
    const manifest = JSON.parse(readFileSync(join(options.outDir, "manifest.json"), "utf8"));
    expect(manifest.status).toBe("candidate-not-approved");
    expect(manifest.source.sha256).toBe(Object.values(pins)[0]);
    expect(manifest.output.sha256).toBe(sha256(readFileSync(join(options.outDir, "en.words.txt"))));
    expect(manifest.noticeSha256).toBe(sha256(readFileSync(join(options.outDir, "NOTICE.txt"))));
    expect(manifest.counts).toEqual({ input: 4, accepted: 2, duplicates: 1, rejected: { frequency: 0, syntax: 1, alphabet: 0 } });
    expect(existsSync(`${options.outDir}.lock`)).toBe(false);
  });
  it("refuses a digest mismatch and missing input without publishing output", () => {
    const { pins, options } = fixture();
    expect(() => exportCandidate(options, { [Object.keys(pins)[0]!]: "bad" })).toThrow("SHA-256");
    expect(() => exportCandidate({ ...options, language: "fr" })).toThrow();
    expect(existsSync(options.outDir)).toBe(false);
  });
  it.each([Buffer.from("invalid"), gzipSync(encode([{ format: "wrong" }]))])("refuses malformed input", (raw) => {
    const { pins, options } = fixture(raw);
    expect(() => exportCandidate(options, pins)).toThrow();
    expect(existsSync(options.outDir)).toBe(false);
  });
  it("never overwrites an existing destination, including an empty directory", () => {
    const { pins, options } = fixture();
    mkdirSync(options.outDir);
    expect(() => exportCandidate(options, pins)).toThrow("already exists");
    expect(readdirSync(options.outDir)).toEqual([]);
    expect(existsSync(`${options.outDir}.lock`)).toBe(false);
  });
  it("respects another export's lock without deleting it", () => {
    const { pins, options } = fixture();
    mkdirSync(`${options.outDir}.lock`);
    expect(() => exportCandidate(options, pins)).toThrow();
    expect(existsSync(`${options.outDir}.lock`)).toBe(true);
    expect(existsSync(options.outDir)).toBe(false);
  });
  it("the CLI rejects duplicate, missing and unknown flags including pin overrides", () => {
    for (const args of [[], ["--language", "en", "--language", "fr"], ["--pins", "custom.json"], ["--raw-dir"]]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", join(import.meta.dirname, "../src/export.ts"), ...args], { encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("export:candidate --raw-dir");
    }
  });
});
