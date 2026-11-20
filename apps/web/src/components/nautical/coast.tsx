import styles from "./nautical.module.css";

/**
 * The red coast: a flat land (`erreur-fond`; in Aube 20 % of `ligne` mixed in `nuit`) with a
 * `ligne` edge. It is the finish. Never a halo, one per screen. Decorative (`aria-hidden`), static.
 *
 * Props
 * - `orientation`: `"horizontal"` (default) → the coastline runs left to right, land above it
 *   (the finish of a vertical track); `"vertical"` → it runs top to bottom, land on its right
 *   (the finish of a horizontal track). For land below or on the left, flip it with a class
 *   (`-scale-y-100`, `-scale-x-100`).
 * - `className`: classes on the `<svg>`. It fills its parent (100 % × 100 %) and stretches: size
 *   and place the parent, e.g. a band across the top of a track. The edge keeps its 3 px.
 *
 * Exposed for tests: `data-coast` (the orientation), `data-coast-land`, `data-coast-edge`.
 */
const SHORE = [78, 81, 84, 87, 90, 66, 69, 72, 75, 78, 81, 84, 87, 90, 66, 72] as const;

export function Coast({ orientation = "horizontal", className = "" }: {
  readonly orientation?: "horizontal" | "vertical";
  readonly className?: string;
}) {
  const step = 100 / (SHORE.length - 1);
  // Horizontal: land from the top edge down to the shore. Vertical: from the right edge to it.
  const shore = SHORE.map((depth, i) => {
    const along = Math.round(i * step * 100) / 100;
    return orientation === "horizontal" ? `${along} ${depth}` : `${100 - depth} ${along}`;
  });
  const land = orientation === "horizontal" ? `M0 0 L${shore.join(" L")} L100 0 Z` : `M100 0 L${shore.join(" L")} L100 100 Z`;
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 100 100" preserveAspectRatio="none" data-coast={orientation}
    className={`${styles.drawing} ${styles.coast} ${className}`}>
    <path data-coast-land="" className={styles.land} d={land} />
    <path data-coast-edge="" className={styles.coastline} d={`M${shore.join(" L")}`} />
  </svg>;
}
