import { gzipSync } from "node:zlib";
import { encode } from "@msgpack/msgpack";
import { describe, expect, it } from "vitest";
import { readCbPack, zipfOfBin } from "../src/cbpack";

const pack = (data: unknown): Uint8Array => gzipSync(encode(data));

describe("readCbPack", () => {
  it("returns the bins after the header, each a list of words", () => {
    expect(readCbPack(pack([{ format: "cB", version: 1 }, ["de", "la"], [], ["maison"]]))).toEqual([["de", "la"], [], ["maison"]]);
  });

  it.each([
    ["an empty pack", []],
    ["a missing header", [["de"]]],
    ["another format", [{ format: "x", version: 1 }, ["de"]]],
    ["another version", [{ format: "cB", version: 2 }, ["de"]]],
    ["a bin that is not a list of words", [{ format: "cB", version: 1 }, ["de", 3]]],
  ])("refuses %s", (_label, data) => {
    expect(() => readCbPack(pack(data))).toThrow(RangeError);
  });
});

describe("readCbPack size bound", () => {
  it("refuses a pack that decompresses beyond the bound", () => {
    const big = pack([{ format: "cB", version: 1 }, Array.from({ length: 2000 }, (_, index) => `mot${index}`)]);
    expect(() => readCbPack(big, 1024)).toThrow(RangeError);
    expect(readCbPack(big)[0]).toHaveLength(2000);
  });
});

describe("zipfOfBin", () => {
  it("maps −i centibels to Zipf 9 − i/100", () => {
    expect(zipfOfBin(0)).toBe(9);
    expect(zipfOfBin(500)).toBe(4);
    expect(zipfOfBin(650)).toBe(2.5);
  });
});
