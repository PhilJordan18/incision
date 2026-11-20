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
  /**
   * Sideways offset of a named runner's ship, in % of the chart's width (vertical chart only): 0
   * unless it would sail under another ship. Drawing only: the marker stays on the real position.
   */
  readonly shipShift: number;
  /** The same on a narrow vertical chart, in lane space (see `NARROW_LANES`): the stylesheet scales it with the lanes. */
  readonly narrowShipShift: number;
  /** The same on the tablet's horizontal chart, in % of its height, for the two ships it draws (me and the leader). */
  readonly horizontalShipShift: number;
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
 * twelve neighbours never share both. Names, pennants and sails still identify every runner:
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

/**
 * The lengthwise axis of both charts, in % of the track: the start at 0, the finish (the coast) at 1.
 * Vertical: upwards. Horizontal (tablet): to the right.
 */
export const trackY = (t: number) => 90 - 77 * t;
export const trackX = (t: number) => 5 + 88 * t;
/** The milestones drawn across the chart, as shares of the text. */
export const MILESTONES = [0.25, 0.5, 0.75] as const;

/** The names' column (in % of the chart's height): five two-line names (31 px) fit apart on a 12 rem chart, under the coast (15 %). */
export const LABEL_TOP = 25;
export const LABEL_BOTTOM = 90;
export const LABEL_GAP = 16.25;

/**
 * How ships are kept from covering one another, in % of the chart, across the lanes (`clear`,
 * `min`, `max`, `reach`) and along the course (`level`, `ease`).
 * - `clear`: two ships whose feet are closer than this across the lanes would cover one another
 *   when they are level.
 * - `level`, `ease`: the clearance asked for eases to nothing as they move apart along the course,
 *   from `level - ease` to `level`.
 * - `min`, `max`: a ship is never drawn outside these (the chart's edge, the names).
 * - `reach`: a ship is never drawn further than this from its marker, so that it still reads as
 *   the end of its own route (a tether joins the two).
 */
export type ShipBerths = { readonly clear: number; readonly level: number; readonly ease: number; readonly min: number; readonly max: number; readonly reach: number };
export const SHIP_BERTHS: ShipBerths = { clear: 7.5, level: 16, ease: 4, min: 4, max: 60, reach: 10 };
/**
 * On a narrow vertical chart (600 px or less: the Arcade row, a low screen, a phone) the first
 * lanes would sail under the finish word. The stylesheet then draws the lanes, 16 to 55 % of the
 * width, between 30 and 55 %: x' = offset + scale × x (race-track.module.css, same numbers).
 * Ships there are berthed in lane space with a clearance and a reach divided by the scale, so that
 * once drawn they keep the same 7.5 % and 10 %, and a ship never starts left of 30 % unless its
 * own marker does (the first lane swings down to about 28.5 %).
 */
export const NARROW_LANES = { offset: 30 - 16 * (25 / 39), scale: 25 / 39 } as const;
/** The lane-space value drawn at 63 % on a narrow chart: where a name's connector ends. */
export const NARROW_LINK_END = Math.round((63 - NARROW_LANES.offset) / NARROW_LANES.scale * 100) / 100;
export const NARROW_SHIP_BERTHS: ShipBerths = { ...SHIP_BERTHS, clear: SHIP_BERTHS.clear / NARROW_LANES.scale, reach: SHIP_BERTHS.reach / NARROW_LANES.scale,
  min: (30 - NARROW_LANES.offset) / NARROW_LANES.scale, max: (SHIP_BERTHS.max - NARROW_LANES.offset) / NARROW_LANES.scale };
/** The tablet's chart: lanes down its 180 px, the course along its width. Only two ships sail there. */
export const HORIZONTAL_SHIP_BERTHS: ShipBerths = { clear: 18, level: 4, ease: 1.5, min: 14, max: 62, reach: 20 };

/** A ship to place: its fixed lane's rank, its marker across the lanes (`across`) and along the course (`along`). */
type Berthing = { readonly id: string; readonly self: boolean; readonly lane: number; /** The fixed lane's own place across the chart, without the route's swing. */ readonly berth: number; readonly across: number; readonly along: number };

/**
 * My neighbours ahead and behind are named because they are at my progress: their ships would
 * often sail under mine. Mine never moves (without me, the ship of the first lane). Every other
 * ship keeps to its own side of it, the side of its fixed lane, and is pushed outwards just far
 * enough to clear the ships already placed, never further than `reach` from its marker: mine is
 * kept clear first, two others may still touch. The side never depends on the route's swing and
 * the push grows smoothly as two ships draw level, so between two broadcasts a ship slides by a
 * little and never jumps. Only the drawing shifts: the marker, the route and the connector keep
 * the broadcast's position.
 */
function shipShifts(ships: readonly Berthing[], berths: ShipBerths): ReadonlyMap<string, number> {
  const anchor = ships.find((ship) => ship.self) ?? [...ships].sort((a, b) => a.lane - b.lane)[0];
  const shifts = new Map<string, number>();
  if (!anchor) return shifts;
  const clearance = (a: Berthing | Placed, b: Berthing | Placed) =>
    berths.clear * Math.max(0, Math.min(1, (berths.level - Math.abs(a.along - b.along)) / berths.ease));
  type Placed = { readonly across: number; readonly along: number };
  const placed: Placed[] = [{ across: anchor.across, along: anchor.along }];
  shifts.set(anchor.id, 0);
  const others = ships.filter((ship) => ship !== anchor);
  // Nearest lane first on each side; the lower side first, so the upper side also clears it.
  const lower = others.filter((ship) => ship.lane < anchor.lane).sort((a, b) => b.lane - a.lane);
  const upper = others.filter((ship) => ship.lane > anchor.lane).sort((a, b) => a.lane - b.lane);
  // A side without room for one ship beside the fixed one (it sails by an edge) sends its ships to
  // the other side. Decided from the lanes, fixed for the round, never from a position.
  const room = berths.clear + SWING;
  if (anchor.berth - berths.min < room && berths.max - anchor.berth >= room) upper.unshift(...lower.splice(0).reverse());
  else if (berths.max - anchor.berth < room && anchor.berth - berths.min >= room) lower.unshift(...upper.splice(0).reverse());
  for (const [side, group] of [[-1, lower], [1, upper]] as const) {
    for (const ship of group) {
      let across = ship.across;
      for (const other of placed) across = side < 0 ? Math.min(across, other.across - clearance(ship, other)) : Math.max(across, other.across + clearance(ship, other));
      across = Math.max(ship.across - berths.reach, Math.min(ship.across + berths.reach, across));
      across = Math.max(Math.min(berths.min, ship.across), Math.min(Math.max(berths.max, ship.across), across));
      placed.push({ across, along: ship.along });
      shifts.set(ship.id, round(across - ship.across));
    }
  }
  return shifts;
}

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
  const share = (index: number) => stable.length <= 1 ? 0.5 : index / (stable.length - 1);
  const laneOf = (index: number) => 16 + 39 * share(index);
  const horizontalLaneOf = (index: number) => 16 + 40 * share(index);
  const raw = stable.map((runner, index) => {
    const id = runner.entrantId;
    // A fixed lane per runner (its place in the crew by id), so that a route never jumps sideways.
    // The lanes leave the chart's bottom-left corner (vertical) and bottom edge (horizontal) to the
    // compass and the names: a ship never starts or sails over them.
    const lane = laneOf(index);
    const horizontalLane = horizontalLaneOf(index);
    const vertical = (t: number) => [lane + swing(t, id), trackY(t)] as const;
    const horizontal = (t: number) => [trackX(t), horizontalLane + swing(t, id)] as const;
    const progress = ratio(runner);
    const [x, y] = vertical(progress);
    const [horizontalX, horizontalY] = horizontal(progress);
    return {
      runner, self: id === selfId, labelled: labelled.has(id),
      tone: id === selfId ? "self" as const : id === leader ? "leader" as const :
        id === ahead ? "nearAhead" as const : id === behind ? "nearBehind" as const : "neutral" as const,
      x, y, horizontalX, horizontalY, labelY: 0, shipShift: 0, narrowShipShift: 0, horizontalShipShift: 0,
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
  const berthing = raw.map((point, lane) => ({ point, id: point.runner.entrantId, self: point.self, lane }));
  const named = berthing.filter(({ point }) => point.labelled).map(({ point, ...ship }) => ({ ...ship, berth: laneOf(ship.lane), across: point.x, along: point.y }));
  const shifts = shipShifts(named, SHIP_BERTHS);
  const narrowShifts = shipShifts(named, NARROW_SHIP_BERTHS);
  const horizontalShifts = shipShifts(berthing.filter(({ point }) => point.self || point.tone === "leader")
    .map(({ point, ...ship }) => ({ ...ship, berth: horizontalLaneOf(ship.lane), across: point.horizontalY, along: point.horizontalX })), HORIZONTAL_SHIP_BERTHS);
  return raw.map((point) => ({ ...point, labelY: labelPositions.get(point.runner.entrantId) ?? point.y,
    shipShift: shifts.get(point.runner.entrantId) ?? 0, narrowShipShift: narrowShifts.get(point.runner.entrantId) ?? 0, horizontalShipShift: horizontalShifts.get(point.runner.entrantId) ?? 0 }));
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
