/**
 * The nautical vocabulary's rules, without React (art direction C1 « Cap », docs/da/v2).
 *
 * - `NauticalKind`: who sails. It alone decides the shape (`sailShape`): a triangle for a human,
 *   a square for a bot, on the ship's sail and on the pennant alike. Never the colour (BOT-04).
 * - `NauticalColour`: a runner's colour, by token name, exactly as `RouteStyle["colour"]` of
 *   `components/races/track-layout.ts` names it (`moi` is the player's own); `ecume` is for a
 *   decorative ship or pennant that stands for nobody in particular.
 * - `NauticalDash`: the runner's route pattern, exactly as `RouteStyle["dash"]`.
 *
 * A `RouteStyle` is therefore a valid `NauticalRoute`: pass `routeStyles(...).get(id)` as it is.
 */
export type NauticalKind = "human" | "bot";
export type NauticalColour = "moi" | "juste" | "arcade" | "embrun" | "brume" | "ecume";
export type NauticalDash = "solid" | "dashed" | "dotted";
export type NauticalRoute = { readonly colour: NauticalColour; readonly dash: NauticalDash };
export type SailShape = "triangle" | "square";

/** The shape-by-kind rule, shared by the ship and the pennant. An unknown kind sails as a human. */
export function sailShape(kind: NauticalKind | undefined): SailShape {
  return kind === "bot" ? "square" : "triangle";
}

/** The quay never moors more hulls than this; the rest is a count, written by the caller. */
export const QUAY_MAX_HULLS = 8;

/** How many of `count` boats are drawn at the quay, and how many are left to the caller's count. */
export function quayBerths(count: number): { readonly moored: number; readonly beyond: number } {
  const total = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  const moored = Math.min(QUAY_MAX_HULLS, total);
  return { moored, beyond: total - moored };
}

/**
 * Wave marks scattered on a `width` × `height` box: a fixed diagonal lattice (the mock-ups' own),
 * so the same box always gets the same marks. Decoration only.
 */
export function waveMarkPositions(width: number, height: number): readonly (readonly [number, number])[] {
  const marks: (readonly [number, number])[] = [];
  const band = Math.max(1, Math.floor(height) - 22);
  const count = Math.max(0, Math.floor((width - 40) / 97) + 1);
  // A mark is 12 px high around its line: in a box too low for the band, it sits at mid-height.
  for (let i = 0; i < count; i++) marks.push([20 + 97 * i, height < 30 ? height / 2 : 8 + ((i * 61 + 17) % band)]);
  return marks;
}
