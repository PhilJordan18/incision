import { type NauticalColour, type NauticalKind, sailShape } from "./shapes";
import styles from "./nautical.module.css";

/**
 * A runner's ship: hull, mast, one sail. Decorative (`aria-hidden`), static, no pointer events.
 *
 * Props
 * - `kind`: `"human"` → triangle sail, `"bot"` → square sail (`sailShape`). Shape only, never colour.
 * - `colour`: the sail's colour, a token name as in `RouteStyle["colour"]` (`routeStyles(...).get(id)!.colour`);
 *   `"ecume"` (default) for a ship that stands for nobody.
 * - `self`: adds the player's two `moi` rings. `leader`: adds the front runner's `or` ring.
 * - `size`: rendered width and height in px (default 54, the drawing's own scale).
 * - `className`: extra classes on the `<svg>` (positioning is the caller's).
 *
 * Geometry: the square view box always includes the rings, so a ship does not shift when it
 * gains or loses one. The ship's foot (the base of its mast, the point to pin on a position)
 * is at `SHIP_ANCHOR` of the box: 50 % across, 57.4 % down.
 * Exposed for tests and styling: `data-ship`, `data-sail` (`triangle` | `square`), `data-colour`,
 * and `data-sail-cloth` on the sail's main shape (its computed `fill` is the runner's colour).
 */
export const SHIP_ANCHOR = { x: 0.5, y: 31 / 54 } as const;

export function Ship({ kind, colour = "ecume", self = false, leader = false, size = 54, className = "" }: {
  readonly kind: NauticalKind;
  readonly colour?: NauticalColour;
  readonly self?: boolean;
  readonly leader?: boolean;
  readonly size?: number;
  readonly className?: string;
}) {
  const sail = sailShape(kind);
  return <svg aria-hidden="true" focusable="false" viewBox="-27 -31 54 54" width={size} height={size}
    data-ship="" data-sail={sail} data-colour={colour} className={`${styles.drawing} ${styles[colour]} ${className}`}>
    {leader && <circle className={styles.leaderRing} cx="0" cy="-4" r="21" />}
    {self && <circle className={styles.selfRing} cx="0" cy="-4" r="19.2" />}
    {self && <circle className={styles.selfRingOuter} cx="0" cy="-4" r="25.6" />}
    <path className={styles.mast} d="M0 -22 V3" />
    {sail === "square"
      ? <rect data-sail-cloth="" className={styles.sail} x="-7" y="-15" width="13" height="13" rx="1.5" />
      : <>
        <path data-sail-cloth="" className={styles.sail} d="M1 -17 L10 0 L1 0 Z" />
        <path className={styles.jib} d="M-1.5 -13 L-1.5 0 L-8 0 Z" />
      </>}
    <path className={styles.sail} d="M0 -22 l7 2.5 l-7 2.5 Z" />
    <path className={styles.hull} d="M-11 3 H11 L7.5 8.5 H-7.5 Z" />
  </svg>;
}
