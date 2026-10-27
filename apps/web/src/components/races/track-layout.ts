import type { RaceProgressPayload } from "@/races/protocol";

type Runner = RaceProgressPayload["broadcast"]["entrants"][number];
export type TrackPoint = {
  readonly runner: Runner;
  readonly self: boolean;
  readonly labelled: boolean;
  readonly tone: "self" | "leader" | "nearAhead" | "nearBehind" | "neutral";
  readonly x: number;
  readonly y: number;
  readonly horizontalX: number;
  readonly horizontalY: number;
  readonly labelY: number;
};

/** Presentation only: progress proximity is NOT the engine's official finish ranking. */
export function trackLayout(entrants: readonly Runner[], selfId: string | null): readonly TrackPoint[] {
  const ratio = (runner: Runner) => Number.isFinite(runner.position / runner.length) ? Math.max(0, Math.min(1, runner.position / runner.length)) : 0;
  const byId = (a: Runner, b: Runner) => a.entrantId < b.entrantId ? -1 : a.entrantId > b.entrantId ? 1 : 0;
  const stable = [...entrants].sort(byId);
  // Abandoned entrants stay visible at their last actual position, but are not highlighted as leaders.
  const active = entrants.filter((r) => r.status !== "abandoned").sort((a, b) => ratio(b) - ratio(a) || byId(a, b));
  const selfIndex = active.findIndex((r) => r.entrantId === selfId);
  const ahead = selfIndex > 0 ? active[selfIndex - 1]?.entrantId : undefined;
  const behind = selfIndex >= 0 ? active[selfIndex + 1]?.entrantId : undefined;
  const labelled = new Set([...active.slice(0, 3).map((r) => r.entrantId), selfId, ahead, behind]);
  const first = active[0];
  // A tie is not a win: no gold leader at the start or among tied finishers.
  const leader = first && ratio(first) > 0 && (active[1] === undefined || ratio(first) > ratio(active[1])) ? first.entrantId : undefined;
  const raw = stable.map((runner, index) => ({
    runner, self: runner.entrantId === selfId, labelled: labelled.has(runner.entrantId),
    tone: runner.entrantId === selfId ? "self" as const : runner.entrantId === leader ? "leader" as const :
      runner.entrantId === ahead ? "nearAhead" as const : runner.entrantId === behind ? "nearBehind" as const : "neutral" as const,
    x: 8 + 48 * (stable.length <= 1 ? 0.5 : index / (stable.length - 1)), y: 90 - 76 * ratio(runner),
    horizontalX: 5 + 88 * ratio(runner), horizontalY: 20 + (index % 5) * 9, labelY: 0,
  }));
  // Named labels use a separate column with a minimum gap; connectors preserve the real position.
  const labels = raw.filter((point) => point.labelled).sort((a, b) => a.y - b.y || byId(a.runner, b.runner));
  const positions = labels.map((point, i) => Math.max(point.y, i === 0 ? 14 : 0));
  for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i]!, positions[i - 1]! + 12);
  if (positions.length) {
    positions[positions.length - 1] = Math.min(86, positions.at(-1)!);
    for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i]!, positions[i + 1]! - 12);
  }
  const namedIds = raw.filter((point) => point.labelled).map((point) => point.runner.entrantId);
  const labelPositions = new Map(labels.map((point, i) => [point.runner.entrantId, positions[i]!]));
  return raw.map((point) => ({ ...point, x: point.labelled ? 12 + 42 * namedIds.indexOf(point.runner.entrantId) / Math.max(1, namedIds.length - 1) : point.x, labelY: labelPositions.get(point.runner.entrantId) ?? point.y }));
}
