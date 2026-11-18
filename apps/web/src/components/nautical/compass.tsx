import styles from "./nautical.module.css";

/**
 * The glass compass: one static drawing, e.g. on the track, away from the text sheet.
 * Decorative (`aria-hidden`); it measures nothing and never turns on its own.
 *
 * Props
 * - `heading`: where the red needle points, in degrees, clockwise from the right (0 = right,
 *   -90 = up, the default: towards the finish of a vertical track).
 * - `size`: rendered width in px (default 63; the height follows the drawing's 150 : 134 box).
 * - `className`: extra classes on the `<svg>` (positioning is the caller's).
 */
export function Compass({ heading = -90, size = 63, className = "" }: {
  readonly heading?: number;
  readonly size?: number;
  readonly className?: string;
}) {
  return <svg aria-hidden="true" focusable="false" viewBox="-75 -67 150 134" width={size} height={Math.round(size * 134 / 150)}
    data-compass="" className={`${styles.drawing} ${className}`}>
    <path className={styles.compassBase} d="M-72 45 H72 L61 65 H-61 Z" />
    <path className={styles.compassBase} d="M-48 32 H48 V45 H-48 Z" />
    <circle className={styles.compassGlass} r="58" />
    <path className={styles.compassLine} d="M-36 -29 A46 46 0 0 1 -12 -44" opacity="0.6" />
    <path className={styles.compassLine} d="M0 -58 V0" />
    <rect className={styles.compassSouth} x="-10" y="-63" width="21" height="6" rx="3" />
    <g transform={`rotate(${heading})`}>
      <path className={styles.compassNorth} d="M0 -5 L36 0 L0 5 Z" />
      <path className={styles.compassSouth} d="M0 -5 L-36 0 L0 5 Z" />
    </g>
    <circle className={styles.compassPivot} r="3" />
  </svg>;
}
