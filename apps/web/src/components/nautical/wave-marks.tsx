import { waveMarkPositions } from "./shapes";
import styles from "./nautical.module.css";

/**
 * Wave marks: short `houle` strokes scattered on a box, behind a page title or in a panel's
 * corner. Never behind text to read or type. Decorative (`aria-hidden`), static.
 *
 * Props
 * - `width`, `height`: the drawing's own box, in px of its view box (defaults 1300 × 170, a page
 *   title's band; 220 × 90 suits a panel corner). The same box always draws the same marks.
 * - `align`: which side stays in view when the box is cropped, `"end"` (default) or `"start"`.
 * - `className`: classes on the `<svg>`; the caller places it (typically `absolute inset-0
 *   size-full`, under content that is `relative`).
 */
export function WaveMarks({ width = 1300, height = 170, align = "end", className = "" }: {
  readonly width?: number;
  readonly height?: number;
  readonly align?: "start" | "end";
  readonly className?: string;
}) {
  return <svg aria-hidden="true" focusable="false" viewBox={`0 0 ${width} ${height}`} data-wave-marks=""
    preserveAspectRatio={align === "end" ? "xMaxYMid slice" : "xMinYMid slice"} className={`${styles.drawing} ${className}`}>
    {waveMarkPositions(width, height).map(([x, y]) => <path key={`${x}-${y}`} className={styles.wave} d={`M${x} ${y} q6 -6 12 0 q6 6 12 0`} />)}
  </svg>;
}
