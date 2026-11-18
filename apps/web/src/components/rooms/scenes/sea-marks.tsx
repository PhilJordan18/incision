import { LINE, SOLID, SURFACE } from "./scene-parts";

/**
 * Ship, wave marks and glass compass as drawn in the C1 mock-ups (docs/da/v2), for the
 * room-entry scenes. Decorative only: a triangle sail is a person, a square sail a bot.
 */

type ShipProps = {
  readonly transform: string;
  /** Token class of the sail, e.g. `fill-moi` for the visitor's own ship. */
  readonly sail?: string;
  readonly bot?: boolean;
};

export function SceneShip({ transform, sail = "fill-ecume", bot = false }: ShipProps) {
  const cloth = `${SOLID} ${sail}`;
  return (
    <g transform={transform}>
      <path d="M0 -22 V3" strokeWidth="1.5" strokeLinecap="round" className={`${LINE} stroke-ecume`} />
      {bot
        ? <rect x="-7" y="-15" width="13" height="13" rx="1.5" className={cloth} />
        : <>
            <path d="M1 -17 L10 0 L1 0 Z" className={cloth} />
            <path d="M-1.5 -13 L-1.5 0 L-8 0 Z" opacity="0.75" className={cloth} />
          </>}
      <path d="M0 -22 l7 2.5 l-7 2.5 Z" className={cloth} />
      <path d="M-11 3 H11 L7.5 8.5 H-7.5 Z" className={`${SOLID} fill-ecume`} />
    </g>
  );
}

type WaveFieldProps = {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  /** Where the lattice starts, so two scenes do not share one pattern. */
  readonly start?: readonly [number, number];
  /** Distance between two consecutive marks; the default is the mock-ups' lattice. */
  readonly step?: readonly [number, number];
};

/** Short wave strokes scattered on a fixed lattice (no randomness: server and browser draw the same). */
export function WaveField({ width, height, count, start = [114, 68], step = [97, 61] }: WaveFieldProps) {
  return (
    <g strokeWidth="1.5" strokeLinecap="round" className={`${LINE} stroke-houle [[data-theme=aube]_&]:stroke-ombre`}>
      {Array.from({ length: count }, (_, index) => {
        const x = 20 + ((start[0] + step[0] * index) % (width - 40));
        const y = 10 + ((start[1] + step[1] * index) % (height - 20));
        return <path key={index} d={`M${x} ${y} q6 -6 12 0 q6 6 12 0`} />;
      })}
    </g>
  );
}

/** The glass compass: one static drawing, its needle the only red of a scene. */
export function GlassCompass({ transform }: { readonly transform: string }) {
  const base = `${SURFACE} fill-nuit stroke-ecume`;
  return (
    <g transform={transform}>
      <path d="M-42 27 H42 L36 38 H-36 Z" strokeWidth="2" strokeLinejoin="round" className={base} />
      <path d="M-28 19 H28 V27 H-28 Z" strokeWidth="2" strokeLinejoin="round" className={base} />
      <circle r="34" strokeWidth="2" className={`${SURFACE} fill-mer/60 stroke-ecume`} />
      <path d="M-21 -17 A27 27 0 0 1 -7 -26" strokeWidth="1.5" strokeLinecap="round" opacity=".6" className={`${LINE} stroke-ecume`} />
      <path d="M0 -34 V0" strokeWidth="1.5" strokeLinecap="round" className={`${LINE} stroke-ecume`} />
      <rect x="-6" y="-39" width="12" height="6" rx="3" className={`${SOLID} fill-ecume`} />
      <g transform="rotate(-58)">
        <path d="M0 -5 L21 0 L0 5 Z" className={`${SOLID} fill-ligne`} />
        <path d="M0 -5 L-21 0 L0 5 Z" className={`${SOLID} fill-ecume`} />
      </g>
      <circle r="3" strokeWidth="1.5" className={`${SURFACE} fill-abysse stroke-ecume`} />
    </g>
  );
}
