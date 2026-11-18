import { Compass, type NauticalColour, Ship, SHIP_ANCHOR } from "@/components/nautical";
import styles from "./home.module.css";

/**
 * Pieces shared by the home's decorative scenes (C1 « Cap »). Everything here is drawn inside an
 * `aria-hidden` SVG: static, never focusable, colours from the design tokens only.
 */

export type SailTone = Extract<NauticalColour, "moi" | "ecume" | "brume">;

type SceneShipProps = {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
  readonly tone: SailTone;
  /** A bot carries a square sail, a human a triangular one: the shape tells them apart, not the colour. */
  readonly bot?: boolean;
};

/** Side of the shared ship's view box, and where the foot of its mast sits in it. */
const SHIP_BOX = 54;

/**
 * The shared ship of the nautical vocabulary, placed in a scene: (`x`, `y`) is the foot of its
 * mast in the scene's own units, as on the race track.
 */
export function SceneShip({ x, y, scale, tone, bot = false }: SceneShipProps) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) translate(${-SHIP_BOX * SHIP_ANCHOR.x} ${-SHIP_BOX * SHIP_ANCHOR.y})`}>
      <Ship kind={bot ? "bot" : "human"} colour={tone} size={SHIP_BOX} />
    </g>
  );
}

/** The shared glass compass, placed in a scene by its centre; its red needle points at the finish. */
export function GlassCompass({ x, y, scale = 1, needle }: { readonly x: number; readonly y: number; readonly scale?: number; readonly needle: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale}) translate(-75 -67)`}>
      <Compass heading={needle} size={150} />
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
      className={`${styles.backdrop} pointer-events-none absolute inset-0 h-full w-full`}
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
export const sceneCaption = "fill-embrun font-mono text-[12px] tracking-[0.2em] uppercase max-xl:text-[15px] max-xl:tracking-[0.08em]";

/** Width and side margins of the site's pages, applied inside each full-width band of the home. */
export const HOME_CONTAINER = "mx-auto w-full max-w-page px-4 sm:px-8 lg:px-12";
