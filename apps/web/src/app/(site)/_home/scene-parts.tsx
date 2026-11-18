import styles from "./home.module.css";

/**
 * Pieces shared by the home's decorative scenes (C1 « Cap »). Everything here is drawn inside an
 * `aria-hidden` SVG: static, never focusable, colours from the design tokens only.
 */

export type SailTone = "moi" | "ecume" | "brume";
const SAIL_TONE: Record<SailTone, string> = { moi: "text-moi", ecume: "text-ecume", brume: "text-brume" };

type SceneShipProps = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly tone: SailTone;
  /** A bot carries a square sail, a human a triangular one: the shape tells them apart, not the colour. */
  readonly bot?: boolean;
  readonly flag?: boolean;
};

/** A ship: hull, mast and one sail in the runner's colour. */
export function SceneShip({ x, y, scale, tone, bot = false, flag = true }: SceneShipProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className={SAIL_TONE[tone]} fill="currentColor">
      <path d="M0-22V3" className="stroke-ecume" strokeWidth="1.5" strokeLinecap="round" />
      {bot ? (
        <rect x="-7" y="-15" width="13" height="13" rx="1.5" />
      ) : (
        <>
          <path d="M1-17 10 0H1Z" />
          <path d="M-1.5-13V0H-8Z" opacity="0.75" />
        </>
      )}
      {flag && <path d="M0-22l7 2.5-7 2.5Z" />}
      <path d="M-11 3H11L7.5 8.5h-15Z" className="fill-ecume" />
    </g>
  );
}

/** The glass compass: one static drawing, its red needle pointing at the finish. */
export function GlassCompass({ x, y, scale = 1, needle }: { readonly x: number; readonly y: number; readonly scale?: number; readonly needle: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} className="stroke-ecume" strokeWidth="2" strokeLinejoin="round">
      <path d="M-72 45H72L61 65H-61Z" className="fill-nuit" />
      <path d="M-48 32H48V45H-48Z" className="fill-nuit" />
      <circle r="58" className="fill-mer/60" />
      <path d="M-36-29A46 46 0 0 1-12-44" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" fill="none" />
      <path d="M0-58V0" strokeWidth="1.5" strokeLinecap="round" />
      <rect x="-10" y="-63" width="21" height="6" rx="3" className="fill-ecume" stroke="none" />
      <g transform={`rotate(${needle})`} stroke="none">
        <path d="M0-5 36 0 0 5Z" className="fill-ligne" />
        <path d="M0-5-36 0 0 5Z" className="fill-ecume" />
      </g>
      <circle r="3" className="fill-abysse" strokeWidth="1.5" />
    </g>
  );
}

/** A lighthouse with its three beams. */
export function Lighthouse({ x, y, scale = 1 }: { readonly x: number; readonly y: number; readonly scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M-8 34-4-14H4L8 34Z" className="fill-ecume" />
      <path d="M-6.5 10h13L6 2H-6Z" className="fill-brume" />
      <rect x="-7" y="-24" width="14" height="10" className="fill-or" />
      <path d="M-9-24 0-34 9-24Z" className="fill-ecume" />
      <path d="M8-19 78-42M8-19 82-16M-8-19-70-40" className="stroke-or" strokeWidth="1.5" strokeLinecap="round" opacity="0.75" />
    </g>
  );
}

const ISLE = "M-80 20q8-44 54-38 30-26 70 0 40 2 38 34-80 26-162 4Z";

/** A charted island: its shore, its dashed shallows and a hill. */
export function Isle({ x, y, scale }: { readonly x: number; readonly y: number; readonly scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d={ISLE} transform="scale(1.34) translate(0 -3)" className="stroke-houle" strokeDasharray="3 6" />
      <path d={ISLE} className="fill-sillage stroke-houle" strokeWidth="1.5" />
      <path d="M-44 8q10-30 40-26 26-10 42 14-40 12-82 12Z" className="fill-houle" />
    </g>
  );
}

type SeaDecorProps = {
  /** Unique in the page: names this band's wave pattern. */
  readonly id: string;
  /** The escale's number, drawn as a large outline from 768 px. */
  readonly ghost?: string;
  readonly ghostSide?: "left" | "right";
};

/** Background of a band: short wave marks, two distant isles and the escale's outlined number. */
export function SeaDecor({ id, ghost, ghostSide = "right" }: SeaDecorProps) {
  return (
    <svg
      viewBox="0 0 1440 580"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={`${styles.scene} pointer-events-none absolute inset-0 h-full w-full`}
    >
      <pattern id={id} width="291" height="183" patternUnits="userSpaceOnUse">
        <path
          d="M20 30q6-6 12 0t12 0M117 91q6-6 12 0t12 0M214 152q6-6 12 0t12 0"
          className="stroke-houle"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </pattern>
      <rect width="1440" height="580" fill={`url(#${id})`} stroke="none" />
      <path d="M1250 110q14-46 60-38 34-24 70 2 40 6 36 34-84 24-166 2Z" className="fill-sillage stroke-houle" strokeWidth="1.5" />
      <path d="M37 534q10-32 42-27 24-17 49 2 28 4 25 24-59 17-116 1Z" className="fill-sillage stroke-houle" strokeWidth="1.5" />
      {ghost !== undefined && (
        <text
          x={ghostSide === "right" ? 1180 : 240}
          y="470"
          textAnchor="middle"
          className="hidden fill-none stroke-houle font-display text-[430px] font-black opacity-55 md:block"
          strokeWidth="2"
        >
          {ghost}
        </text>
      )}
    </svg>
  );
}

/** Mono caption inside a scene. */
export const sceneCaption = "fill-embrun font-mono text-[12px] tracking-[0.2em] uppercase max-md:text-[15px] max-md:tracking-[0.08em]";
