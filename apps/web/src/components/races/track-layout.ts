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
  /** The runner's stable sea route, the same on every refresh of the round (see `routeStyle`). */
  readonly route: RouteStyle;
  /** The route from the start to the runner's real progress, in the track's 0–100 boxes. */
  readonly path: string;
  readonly horizontalPath: string;
};

/** Runner colours only (design rule 5's family): `moi` is the player's own, never another's. */
export const ROUTE_COLOURS = ["juste", "arcade", "embrun", "brume"] as const;
export const ROUTE_DASHES = ["solid", "dashed", "dotted"] as const;
export type RouteStyle = {
  readonly colour: "moi" | (typeof ROUTE_COLOURS)[number];
  readonly dash: (typeof ROUTE_DASHES)[number];
};

/**
 * Each runner's route, fixed for the round: the player's own in `moi`, the others by their place
 * in the crew sorted by id (not by rank, which changes), a colour then a dash pattern, so that
 * twelve neighbours never share both. Names, initials and markers still identify every runner:
 * the colour is never the only cue (rule 8).
 */
export function routeStyle(stableIndex: number, self: boolean): RouteStyle {
  if (self) return { colour: "moi", dash: "solid" };
  const colour = ROUTE_COLOURS[stableIndex % ROUTE_COLOURS.length]!;
  const dash = ROUTE_DASHES[Math.floor(stableIndex / ROUTE_COLOURS.length) % ROUTE_DASHES.length]!;
  return { colour, dash };
}

/**
 * Every runner's route style, by id: what the track draws and the standings show beside a name.
 * Stable for the round on this screen: the index follows the sorted ids of the round's other
 * runners (a race's entrants are fixed once it starts), so a refresh, a reorder or a reload keeps
 * it. Your own route is always `moi`, so two players may see the same runner in another colour.
 */
export function routeStyles(entrants: readonly Pick<Runner, "entrantId">[], selfId: string | null): ReadonlyMap<string, RouteStyle> {
  const others = entrants.map((runner) => runner.entrantId).filter((id) => id !== selfId).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const styles = new Map(others.map((id, index) => [id, routeStyle(index, false)]));
  if (selfId !== null && entrants.some((runner) => runner.entrantId === selfId)) styles.set(selfId, routeStyle(0, true));
  return styles;
}

/** A small, fixed number per runner: its route's phase. Decoration only, never a measure. */
function phase(id: string): number {
  let hash = 2166136261;
  for (let i = 0; i < id.length; i++) hash = Math.imul(hash ^ id.charCodeAt(i), 16777619);
  return ((hash >>> 0) % 1000) / 1000;
}

/** Sideways swing of a route, in % of the track: a gentle S on a chart, the same for a given progress. */
const SWING = 2.4;
function swing(t: number, id: string): number {
  return SWING * Math.sin(2 * Math.PI * (1.25 * t + phase(id)));
}
const round = (value: number) => Math.round(value * 100) / 100;

/**
 * The route drawn behind a marker: from the start (t = 0) to the runner's real progress `ratio`,
 * never further. Only the lengthwise axis is a fact; the sideways curve is a deterministic
 * ornament (no invented move, distance or overtaking).
 */
function routePath(ratio: number, point: (t: number) => readonly [number, number]): string {
  const steps = Math.ceil(ratio / 0.04);
  const coords: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const [x, y] = point(Math.min(ratio, i * 0.04));
    coords.push(`${round(x)},${round(y)}`);
  }
  return coords.length === 1 ? `${coords[0]} ${coords[0]}` : coords.join(" ");
}

/** The names' column (in % of the chart's height): five two-line names (31 px) fit apart on a 12 rem chart, under the finish band (12 %). */
export const LABEL_TOP = 25;
export const LABEL_BOTTOM = 90;
export const LABEL_GAP = 16.25;

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
  // At most five names, so that they stay apart on a short chart: the first two, me and my neighbours.
  const labelled = new Set([...active.slice(0, 2).map((r) => r.entrantId), selfId, ahead, behind]);
  const first = active[0];
  // A tie is not a win: no gold leader at the start or among tied finishers.
  const leader = first && ratio(first) > 0 && (active[1] === undefined || ratio(first) > ratio(active[1])) ? first.entrantId : undefined;
  const routes = routeStyles(stable, selfId);
  const raw = stable.map((runner, index) => {
    const id = runner.entrantId;
    // A fixed lane per runner (its place in the crew by id), so that a route never jumps sideways.
    const lane = 9 + 46 * (stable.length <= 1 ? 0.5 : index / (stable.length - 1));
    const horizontalLane = 14 + 66 * (stable.length <= 1 ? 0.5 : index / (stable.length - 1));
    const vertical = (t: number) => [lane + swing(t, id), 90 - 77 * t] as const;
    const horizontal = (t: number) => [5 + 88 * t, horizontalLane + swing(t, id)] as const;
    const progress = ratio(runner);
    const [x, y] = vertical(progress);
    const [horizontalX, horizontalY] = horizontal(progress);
    return {
      runner, self: id === selfId, labelled: labelled.has(id),
      tone: id === selfId ? "self" as const : id === leader ? "leader" as const :
        id === ahead ? "nearAhead" as const : id === behind ? "nearBehind" as const : "neutral" as const,
      x, y, horizontalX, horizontalY, labelY: 0,
      route: routes.get(id)!,
      path: routePath(progress, vertical), horizontalPath: routePath(progress, horizontal),
    };
  });
  // Named labels use a separate column with a minimum gap; connectors preserve the real position.
  const labels = raw.filter((point) => point.labelled).sort((a, b) => a.y - b.y || byId(a.runner, b.runner));
  const positions = labels.map((point, i) => Math.max(point.y, i === 0 ? LABEL_TOP : 0));
  for (let i = 1; i < positions.length; i++) positions[i] = Math.max(positions[i]!, positions[i - 1]! + LABEL_GAP);
  if (positions.length) {
    positions[positions.length - 1] = Math.min(LABEL_BOTTOM, positions.at(-1)!);
    for (let i = positions.length - 2; i >= 0; i--) positions[i] = Math.min(positions[i]!, positions[i + 1]! - LABEL_GAP);
  }
  const labelPositions = new Map(labels.map((point, i) => [point.runner.entrantId, positions[i]!]));
  // Markers stay at the end of their own route: never moved aside for a label.
  return raw.map((point) => ({ ...point, labelY: labelPositions.get(point.runner.entrantId) ?? point.y }));
}

/**
 * The standings panel's order: furthest first, finishers before those still racing at the same
 * progress, those who gave up last; ties keep a stable id order. Presentation only: the engine's
 * official ranking (COURSE-10) comes with the results.
 */
export function standingsOrder(entrants: readonly Runner[]): readonly Runner[] {
  const ratio = (runner: Runner) => runner.length > 0 ? Math.max(0, Math.min(1, runner.position / runner.length)) : 0;
  const group = (runner: Runner) => runner.status === "finished" ? 0 : 1;
  return [...entrants].sort((a, b) => {
    const abandoned = Number(a.status === "abandoned") - Number(b.status === "abandoned");
    if (abandoned !== 0) return abandoned;
    return ratio(b) - ratio(a) || group(a) - group(b) || (a.entrantId < b.entrantId ? -1 : a.entrantId > b.entrantId ? 1 : 0);
  });
}
