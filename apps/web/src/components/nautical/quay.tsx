import { type NauticalColour, type NauticalKind, QUAY_MAX_HULLS, sailShape } from "./shapes";
import styles from "./nautical.module.css";

/**
 * The quay: a bounded strip of moored hulls. Decorative (`aria-hidden`), static; the crew list
 * beside it says who is there. Remove it on a low screen (the caller's media query).
 *
 * Props
 * - `hulls`: the boats, in order: `{ kind, colour?, self? }`. Only the first eight
 *   (`QUAY_MAX_HULLS`) are drawn, whatever the length. `kind` decides the sail's shape; `self`
 *   draws the player's own boat larger; `colour` defaults to `"ecume"`.
 * - `more`: the count of the others, already written by the caller from its dictionary
 *   (« +8 au mouillage »); use `quayBerths(total).beyond` for the number. Nothing when absent.
 * - `className`: classes on the strip (a 150 px band by default; set another height here).
 *
 * Exposed for tests: `data-quay`, one `data-quay-hull` (`triangle` | `square`) per boat drawn.
 */
export type QuayHull = { readonly kind: NauticalKind; readonly colour?: NauticalColour; readonly self?: boolean };

export function Quay({ hulls, more, className = "" }: {
  readonly hulls: readonly QuayHull[];
  readonly more?: string;
  readonly className?: string;
}) {
  const moored = hulls.slice(0, QUAY_MAX_HULLS);
  const berth = (index: number) => index === 0 ? 112 : 130 + 76 * index;
  const end = moored.length === 0 ? 112 : berth(moored.length - 1) + 60;
  return <div aria-hidden="true" data-quay="" className={`${styles.quay} ${className}`}>
    <svg focusable="false" viewBox="0 0 1440 150" preserveAspectRatio="xMinYMid slice">
      {/* Posts first: a hull moors in front of them. */}
      {Array.from({ length: moored.length === 0 ? 0 : Math.floor((end - 90) / 96) + 1 }, (_, index) =>
        <path key={index} className={styles.post} d={`M${60 + 96 * index} 108 V132`} />)}
      {moored.map((hull, index) => {
        const sail = sailShape(hull.kind);
        return <g key={index} data-quay-hull={sail} className={styles[hull.colour ?? "ecume"]}
          transform={`translate(${berth(index)} ${hull.self ? 106 : 108}) scale(${hull.self ? 2.3 : 1.6})`}>
          <path className={styles.mast} d="M0 -22 V3" />
          {sail === "square"
            ? <rect className={styles.sail} x="-7" y="-15" width="13" height="13" rx="1.5" />
            : <><path className={styles.sail} d="M1 -17 L10 0 L1 0 Z" /><path className={styles.jib} d="M-1.5 -13 L-1.5 0 L-8 0 Z" /></>}
          <path className={styles.sail} d="M0 -22 l7 2.5 l-7 2.5 Z" />
          <path className={styles.hull} d="M-11 3 H11 L7.5 8.5 H-7.5 Z" />
        </g>;
      })}
      <path className={styles.dock} d={`M-10 122 H${end} V136 H-10 Z`} />
      {more ? <text className={styles.quayCount} x={end + 22} y="112">{more}</text> : null}
    </svg>
  </div>;
}
