import { gunzipSync } from "node:zlib";
import { decode } from "@msgpack/msgpack";

/**
 * wordfreq's "cB" pack (wordfreq 3.1.1, `read_cBpack`): a gzipped MessagePack array whose first
 * element is the header `{ format: "cB", version: 1 }`, then one list of words per frequency bin.
 * The list at index i (after the header) holds the words whose frequency is −i centibels, that is
 * 10^(−i/100) of all words.
 */
export type FrequencyBins = readonly (readonly string[])[];

export function readCbPack(gzipped: Uint8Array): FrequencyBins {
  const data: unknown = decode(gunzipSync(gzipped));
  if (!Array.isArray(data) || data.length === 0) {
    throw new RangeError("A cB pack is a non-empty array");
  }
  const [header, ...bins] = data as unknown[];
  if (typeof header !== "object" || header === null || (header as Record<string, unknown>).format !== "cB" || (header as Record<string, unknown>).version !== 1) {
    throw new RangeError(`Unexpected cB pack header: ${JSON.stringify(header)}`);
  }
  return bins.map((bin, index) => {
    if (!Array.isArray(bin) || !bin.every((word) => typeof word === "string")) {
      throw new RangeError(`Bin ${index} is not a list of words`);
    }
    return bin as string[];
  });
}

/** The Zipf value of a bin: log10 of the frequency per billion words, 9 − i/100. */
export function zipfOfBin(index: number): number {
  return 9 - index / 100;
}
