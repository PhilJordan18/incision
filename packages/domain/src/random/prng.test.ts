import { describe, expect, it } from "vitest";
import { asRandomState, createRandom, PRNG_VERSION, type Random, type RandomState, shuffled } from "./prng";

const draws = (random: Random, count: number): number[] => Array.from({ length: count }, () => random.uint32());

/** A second, independent model of xoshiro128** in BigInt arithmetic: no sign or overflow tricks. */
function modelOutputs(state: RandomState, count: number): number[] {
  const mask = (1n << 32n) - 1n;
  const rotl = (value: bigint, shift: bigint): bigint => ((value << shift) | (value >> (32n - shift))) & mask;
  let [s0, s1, s2, s3] = state.map(BigInt) as [bigint, bigint, bigint, bigint];
  const outputs: number[] = [];
  for (let step = 0; step < count; step += 1) {
    outputs.push(Number((rotl((s1 * 5n) & mask, 7n) * 9n) & mask));
    const t = (s1 << 9n) & mask;
    s2 ^= s0;
    s3 ^= s1;
    s1 ^= s2;
    s0 ^= s3;
    s2 ^= t;
    s3 = rotl(s3, 11n);
  }
  return outputs;
}

/** A state whose first output is `target`, by inverting rotl(s1 · 5, 7) · 9 modulo 2^32. */
function stateWithFirstOutput(target: number): RandomState {
  const modulus = 1n << 32n;
  const inverseOf9 = 0x38e3_8e39n;
  const inverseOf5 = 0xcccc_cccdn;
  const rotated = (BigInt(target) * inverseOf9) % modulus;
  const unrotated = ((rotated >> 7n) | (rotated << 25n)) % modulus;
  return [1, Number((unrotated * inverseOf5) % modulus), 0, 0];
}

const HIGH_BIT_STATES: readonly RandomState[] = [
  [0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff],
  [0x8000_0000, 0, 0, 0],
  [0, 0x8000_0000, 0, 0],
  [0, 0, 0, 1],
  [0xdead_beef, 0x0123_4567, 0x89ab_cdef, 0xfedc_ba98],
];

describe("xoshiro128** (PRNG_VERSION)", () => {
  it("names the algorithm and its version", () => {
    expect(PRNG_VERSION).toBe("xoshiro128ss-1.1");
  });

  // Vectors from the reference C file itself (prng.di.unimi.it/xoshiro128starstar.c, SHA-256
  // 2e3e540e…0a141a67, fetched 2026-10-11), compiled unchanged; the first one is also cited by the
  // rand_xoshiro tests.
  it.each<[string, RandomState, number[]]>([
    ["[1, 2, 3, 4]", [1, 2, 3, 4], [11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804]],
    ["all ones", [0xffff_ffff, 0xffff_ffff, 0xffff_ffff, 0xffff_ffff], [4294962679, 4294962679, 4292019319, 2943360, 1509943680, 246671744]],
    ["mixed high bits", [0xdead_beef, 0x0123_4567, 0x89ab_cdef, 0xfedc_ba98], [2576977298, 1162350735, 558593417, 7144843, 2523195487, 3129381430]],
    ["a single low bit", [0, 0, 0, 1], [0, 0, 5760, 11802240, 2699105920, 137178368]],
  ])("starts from the initial state %s exactly like the reference", (_label, state, expected) => {
    expect(draws(createRandom(state), expected.length)).toEqual(expected);
  });

  it("holds the reference state after 1 000 draws, and resumes from it like the reference", () => {
    const random = createRandom([1, 2, 3, 4]);
    draws(random, 1_000);
    expect(random.state()).toEqual([2954884481, 294556968, 2598411021, 550772539]);
    expect(draws(createRandom([2954884481, 294556968, 2598411021, 550772539]), 4)).toEqual([136054147, 2224941748, 1458134130, 3964477073]);
  });

  it("agrees with the BigInt model on states with high bits set, over many outputs", () => {
    const derived = draws(createRandom([1, 2, 3, 4]), 80);
    const states = [...HIGH_BIT_STATES, ...Array.from({ length: 20 }, (_, index) => asRandomState(derived.slice(index * 4, index * 4 + 4)))];
    for (const state of states) {
      expect(draws(createRandom(state), 1_000)).toEqual(modelOutputs(state, 1_000));
    }
  });

  it("always returns uint32 values", () => {
    for (const state of HIGH_BIT_STATES) {
      expect(draws(createRandom(state), 1_000).every((value) => Number.isInteger(value) && value >= 0 && value < 2 ** 32)).toBe(true);
    }
  });
});

describe("the random state", () => {
  it.each([0, 1, 7, 100])("resumes after %i draws exactly where an unbroken run goes", (before) => {
    const unbroken = createRandom([0xdead_beef, 5, 6, 7]);
    const interrupted = createRandom([0xdead_beef, 5, 6, 7]);
    draws(unbroken, before);
    draws(interrupted, before);
    const resumed = createRandom(asRandomState([...interrupted.state()]));
    expect(draws(resumed, 50)).toEqual(draws(unbroken, 50));
  });

  it("is never shared: generators, their input and the returned state are independent", () => {
    const input: [number, number, number, number] = [9, 8, 7, 6];
    const first = createRandom(input);
    const second = createRandom(input);
    input[1] = 0;
    const snapshot = first.state() as unknown as number[];
    snapshot[0] = 0;
    draws(first, 5);
    expect(draws(second, 5)).toEqual(modelOutputs([9, 8, 7, 6], 5));
    expect(draws(first, 1)).toEqual(modelOutputs([9, 8, 7, 6], 6).slice(5));
  });

  it("accepts four uint32 that are not all zero", () => {
    expect(asRandomState([0, 0, 0, 1])).toEqual([0, 0, 0, 1]);
    expect(asRandomState([2 ** 32 - 1, 0, 0, 0])).toEqual([2 ** 32 - 1, 0, 0, 0]);
  });

  it.each([
    ["three values", [1, 2, 3]],
    ["five values", [1, 2, 3, 4, 5]],
    ["a negative value", [1, 2, 3, -1]],
    ["2^32", [1, 2, 3, 2 ** 32]],
    ["a fraction", [1, 2, 3, 1.5]],
    ["NaN", [1, 2, 3, Number.NaN]],
    ["all zeros", [0, 0, 0, 0]],
    ["a sparse array, whose hole every() would skip", Object.assign(new Array<number>(4), { 0: 1, 2: 3, 3: 4 })],
  ])("refuses %s", (_label, values) => {
    expect(() => asRandomState(values)).toThrow(RangeError);
    expect(() => createRandom(values as unknown as RandomState)).toThrow(RangeError);
  });
});

describe("index", () => {
  it.each([0, -1, 1.5, Number.NaN, 2 ** 32 + 1])("refuses the bound %s", (bound) => {
    expect(() => createRandom([1, 2, 3, 4]).index(bound)).toThrow(RangeError);
  });

  it("returns the raw output for 2^32 and 0 for 1, one draw each", () => {
    const random = createRandom([1, 2, 3, 4]);
    expect([random.index(2 ** 32), random.index(1), random.index(2 ** 32)]).toEqual([11520, 0, 5927040]);
  });

  it.each([3 * 2 ** 30, 2 ** 32 - 1, 2 ** 31 + 1, 6])("rejects exactly the outputs at or above the largest multiple of %i", (bound) => {
    const limit = 2 ** 32 - (2 ** 32 % bound);
    const stream = modelOutputs([0xdead_beef, 0x0123_4567, 0x89ab_cdef, 0xfedc_ba98], 5_000);
    const expected = stream.filter((value) => value < limit).map((value) => value % bound);
    const random = createRandom([0xdead_beef, 0x0123_4567, 0x89ab_cdef, 0xfedc_ba98]);
    const count = Math.min(expected.length, 3_000);
    expect(Array.from({ length: count }, () => random.index(bound))).toEqual(expected.slice(0, count));
    if (bound === 3 * 2 ** 30) {
      expect(stream.slice(0, 3_000).some((value) => value >= limit)).toBe(true);
    }
  });

  it("rejects an output equal to the limit and accepts the one just below", () => {
    const bound = 2 ** 32 - 1;
    const atLimit = stateWithFirstOutput(2 ** 32 - 1);
    const [first, second] = modelOutputs(atLimit, 2) as [number, number];
    expect(first).toBe(2 ** 32 - 1);
    expect(createRandom(atLimit).index(bound)).toBe(second % bound);
    const belowLimit = stateWithFirstOutput(2 ** 32 - 2);
    expect(modelOutputs(belowLimit, 1)).toEqual([2 ** 32 - 2]);
    expect(createRandom(belowLimit).index(bound)).toBe(2 ** 32 - 2);
  });

  it("spreads a small bound evenly", () => {
    const random = createRandom([0xdead_beef, 1, 2, 3]);
    const counts = [0, 0, 0, 0, 0, 0];
    for (let draw = 0; draw < 60_000; draw += 1) {
      const face = random.index(6);
      counts[face] = (counts[face] ?? 0) + 1;
    }
    expect(counts.every((count) => Math.abs(count - 10_000) < 500)).toBe(true);
  });

});

describe("shuffled", () => {
  it("returns a permutation and leaves the input as is", () => {
    const items = ["a", "b", "c", "d", "e", "f", "g"];
    const result = shuffled(items, createRandom([1, 2, 3, 4]));
    expect(items).toEqual(["a", "b", "c", "d", "e", "f", "g"]);
    expect([...result].sort()).toEqual(items);
  });

  it("follows Fisher–Yates from the last position down, one index draw per position", () => {
    const items = Array.from({ length: 30 }, (_, index) => index);
    const oracle = createRandom([5, 6, 7, 8]);
    const expected = [...items];
    for (let last = expected.length - 1; last > 0; last -= 1) {
      const other = oracle.index(last + 1);
      [expected[last], expected[other]] = [expected[other] as number, expected[last] as number];
    }
    const random = createRandom([5, 6, 7, 8]);
    expect(shuffled(items, random)).toEqual(expected);
    expect(random.state()).toEqual(oracle.state());
  });

  it("handles empty and single lists without drawing", () => {
    const random = createRandom([1, 2, 3, 4]);
    expect(shuffled([], random)).toEqual([]);
    expect(shuffled(["only"], random)).toEqual(["only"]);
    expect(random.state()).toEqual([1, 2, 3, 4]);
  });
});
