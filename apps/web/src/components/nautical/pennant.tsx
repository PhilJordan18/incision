import { type NauticalColour, type NauticalDash, type NauticalKind, sailShape } from "./shapes";
import styles from "./nautical.module.css";

/**
 * A runner's pennant, small (24 × 16 px), beside a name: in lists it replaces the route's line
 * swatch. Decorative (`aria-hidden`), static; the name and the word « Bot » say who it is.
 *
 * Props
 * - `kind`: `"human"` → triangle cloth, `"bot"` → square cloth, the ship's own rule (`sailShape`).
 * - `colour`, `dash`: the runner's route, as `RouteStyle` of `components/races/track-layout.ts`
 *   gives it. Spread it: `<Pennant kind={runner.kind} {...routes.get(runner.entrantId)!} />`.
 *   Defaults: `"ecume"`, `"solid"`.
 *   The cloth takes the colour; the line under it is a sample of the route itself, with the same
 *   solid / dashed / dotted pattern, so two runners of one colour still differ without colour.
 * - `className`: extra classes on the `<svg>`.
 *
 * Exposed for tests: `data-pennant` (`triangle` | `square`), `data-colour`, `data-dash`,
 * `data-pennant-cloth` (computed `fill` = the colour) and `data-pennant-wake` (computed `stroke`
 * and `stroke-dasharray` = the route's).
 */
export function Pennant({ kind, colour = "ecume", dash = "solid", className = "" }: {
  readonly kind: NauticalKind;
  readonly colour?: NauticalColour;
  readonly dash?: NauticalDash;
  readonly className?: string;
}) {
  const shape = sailShape(kind);
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 16" width="24" height="16"
    data-pennant={shape} data-colour={colour} data-dash={dash}
    className={`${styles.drawing} ${styles.pennant} ${styles[colour]} ${className}`}>
    <path className={styles.staff} d="M2 1 V15" />
    {shape === "square"
      ? <rect data-pennant-cloth="" className={styles.cloth} x="3" y="1.5" width="13" height="9" rx="1.5" />
      : <path data-pennant-cloth="" className={styles.cloth} d="M3 1.5 L20 6 L3 10.5 Z" />}
    <path data-pennant-wake="" className={`${styles.wake} ${dash === "solid" ? "" : styles[dash]}`} d="M6 14 H23" />
  </svg>;
}

/**
 * A spectator's sign, where a runner would have a pennant: an eye, same box (24 × 16 px).
 * Decorative (`aria-hidden`); the word « spectateur » stays beside it. No props but `className`.
 */
export function SpectatorEye({ className = "" }: { readonly className?: string }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 24 16" width="24" height="16" data-spectator-eye=""
    className={`${styles.drawing} ${styles.eye} ${className}`}>
    <path d="M2 8 C6 2 18 2 22 8 C18 14 6 14 2 8 Z" />
    <circle cx="12" cy="8" r="2.6" />
  </svg>;
}
