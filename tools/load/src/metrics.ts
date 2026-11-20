/** Nearest-rank percentiles; empty input is missing evidence, never a zero latency. */
export function summary(values: readonly number[]) {
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("Invalid latency sample");
  }
  const sorted = [...values].sort((a, b) => a - b);
  const at = (fraction: number) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)] ?? null;
  return { count: sorted.length, median: at(0.5), p95: at(0.95), p99: at(0.99), max: at(1) };
}

/** Fixed memory bound. Exceeding it invalidates the run rather than silently losing samples. */
export class Samples {
  readonly values: number[] = [];
  add(value: number) {
    if (!Number.isFinite(value) || value < 0 || this.values.length >= 100_000) {
      throw new Error("Invalid or overflowing metrics");
    }
    this.values.push(value);
  }
  report() { return summary(this.values); }
}

/** A completed transport run needs proof from every expected client and from storage. */
export function assertCoverage(input: {
  runners: number; spectators: number; finished: number; stored: number;
  observing: number; acknowledged: number; expected: number; errors: number; disconnects: number;
}) {
  if (input.runners < 2 || input.spectators < 0 || input.finished !== input.runners ||
      input.stored !== input.runners || input.observing !== input.spectators ||
      input.expected <= 0 || input.acknowledged !== input.expected || input.errors !== 0 || input.disconnects !== 0) {
    throw new Error("Incomplete load coverage");
  }
}
