/**
 * Seeded randomness for generated race texts (F-02.4), and later bots (F-05.1) and bonuses
 * (F-06.1). Never for anything secret: room codes and tokens keep a crypto source (D-01).
 *
 * Algorithm: xoshiro128** 1.1 by David Blackman and Sebastiano Vigna (2018), reference
 * https://prng.di.unimi.it/xoshiro128starstar.c, whose authors dedicate it to the public domain
 * and grant permission to use, copy, modify and distribute it. This is written from the published
 * algorithm; no code is copied.
 */
import type { RandomIndex } from "../rooms/room-code";

/**
 * Names the generator, the rejection rule of `index` and the order of `shuffled`. Changing any of
 * them changes every text drawn from a stored state, so the version is stored with the state.
 */
export const PRNG_VERSION = "xoshiro128ss-1.1";

/** The whole generator state: four uint32, not all zero. The server draws it with crypto. */
export type RandomState = readonly [number, number, number, number];

export type Random = {
  /** The next 32-bit output. */
  readonly uint32: () => number;
  /** An unbiased integer in `[0, upperBound)`, by rejection; `upperBound` from 1 to 2^32. */
  readonly index: RandomIndex;
  /** A copy of the current state: resuming from it continues the same sequence. */
  readonly state: () => RandomState;
};

const UINT32_RANGE = 2 ** 32;

/** Checks a stored or freshly drawn state; RangeError unless four uint32, not all zero. */
export function asRandomState(values: readonly number[]): RandomState {
  if (values.length !== 4 || !values.every((value) => Number.isInteger(value) && value >= 0 && value < UINT32_RANGE)) {
    throw new RangeError("A random state is four integers in [0, 2^32)");
  }
  if (values.every((value) => value === 0)) {
    throw new RangeError("A random state cannot be all zero: xoshiro would only ever return 0");
  }
  return [values[0], values[1], values[2], values[3]] as RandomState;
}

const rotl = (value: number, shift: number): number => ((value << shift) | (value >>> (32 - shift))) >>> 0;

/** A generator local to one pure call; never keep one at module level. */
export function createRandom(from: RandomState): Random {
  let [s0, s1, s2, s3] = asRandomState(from);

  const uint32 = (): number => {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = s1 << 9;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    return result;
  };

  const index = (upperBound: number): number => {
    if (!Number.isInteger(upperBound) || upperBound < 1 || upperBound > UINT32_RANGE) {
      throw new RangeError(`upperBound ${upperBound} is not an integer from 1 to 2^32`);
    }
    // Accept only outputs below the largest multiple of upperBound, so every index is equally likely.
    const limit = UINT32_RANGE - (UINT32_RANGE % upperBound);
    for (;;) {
      const value = uint32();
      if (value < limit) {
        return value % upperBound;
      }
    }
  };

  return { uint32, index, state: () => [s0, s1, s2, s3] };
}

/** A shuffled copy (Fisher–Yates, from the last position down); the input is left as is. */
export function shuffled<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items];
  for (let last = copy.length - 1; last > 0; last -= 1) {
    const other = random.index(last + 1);
    [copy[last], copy[other]] = [copy[other] as T, copy[last] as T];
  }
  return copy;
}
