import type { ReactNode } from "react";

/**
 * Pieces shared by the C1 room-entry scenes (docs/da/v2, card DA2-6): the sea chart frame and
 * the land drawings. Everything here is decorative, static and hidden from assistive technology.
 * Colours are token classes; in forced colours every shape takes a system colour, and that
 * rule is marked important so that it also wins over the Aube variants (`[data-theme=aube] …`).
 */

/** A stroke without fill. */
export const LINE = "fill-none forced-colors:stroke-[CanvasText]!";
/** A filled shape without outline. */
export const SOLID = "forced-colors:fill-[CanvasText]!";
/** A surface with an outline: emptied and outlined in forced colours. */
export const SURFACE = "forced-colors:fill-[Canvas]! forced-colors:stroke-[CanvasText]!";

/** The framed sea a scene is drawn on. `className` sizes it; the drawing never takes a click or the focus. */
export function SeaChart({ scene, className = "", children }: { readonly scene: string; readonly className?: string; readonly children: ReactNode }) {
  return (
    <div aria-hidden="true" data-scene={scene} className={`pointer-events-none overflow-hidden rounded-carte border border-houle bg-mer select-none ${className}`}>
      {children}
    </div>
  );
}

/** An island: flat land, lighter on Aube where the sea is pale. `halo` adds the dashed shoal line around it. */
export function Isle({ transform, wide = false, halo = false }: { readonly transform?: string; readonly wide?: boolean; readonly halo?: boolean }) {
  const outline = wide
    ? "M-90 20 q14 -46 60 -38 q34 -24 70 2 q40 6 36 34 q-84 24 -166 2 Z"
    : "M-80 20 q8 -44 54 -38 q30 -26 70 0 q40 2 38 34 q-80 26 -162 4 Z";
  return (
    <g transform={transform}>
      {halo && <path d={outline} transform="scale(1.34) translate(0 -3)" strokeDasharray="3 6" className={`${LINE} stroke-houle [[data-theme=aube]_&]:stroke-voile`} />}
      <path d={outline} strokeWidth="1.5" className={`${SURFACE} fill-sillage stroke-houle [[data-theme=aube]_&]:fill-houle [[data-theme=aube]_&]:stroke-voile`} />
      {!wide && <path d="M-44 8 q10 -30 40 -26 q26 -10 42 14 q-40 12 -82 12 Z" className={`fill-houle [[data-theme=aube]_&]:fill-sillage forced-colors:fill-[Canvas]!`} />}
    </g>
  );
}

/** The lighthouse of the public harbour: its lamp and beams are the chart's only `or`. */
export function Lighthouse({ transform }: { readonly transform: string }) {
  return (
    <g transform={transform}>
      <path d="M-8 34 L-4 -14 H4 L8 34 Z" className={`${SOLID} fill-ecume`} />
      <path d="M-6.5 10 H6.5 L6 2 H-6 Z" className="fill-brume forced-colors:fill-[Canvas]!" />
      <rect x="-7" y="-24" width="14" height="10" className="fill-or forced-colors:fill-[Highlight]!" />
      <path d="M-9 -24 L0 -34 L9 -24 Z" className={`${SOLID} fill-ecume`} />
      <path d="M8 -19 L78 -42 M8 -19 L82 -16 M-8 -19 L-70 -40" strokeWidth="1.5" strokeLinecap="round" opacity=".75" className={`${LINE} stroke-or`} />
    </g>
  );
}

export function House({ transform }: { readonly transform: string }) {
  return (
    <g transform={transform}>
      <rect x="-6" y="-8" width="12" height="9" className={`${SOLID} fill-embrun`} />
      <path d="M-8 -8 L0 -15 L8 -8 Z" className={`${SOLID} fill-ecume`} />
    </g>
  );
}

export function Tree({ transform }: { readonly transform: string }) {
  return (
    <g transform={transform}>
      <path d="M0 0 V-8" strokeWidth="2" className={`${LINE} stroke-brume`} />
      <circle cy="-12" r="6" className={`${SOLID} fill-voile`} />
    </g>
  );
}

/** A dotted course across the chart. */
export function Course({ d, width = 2 }: { readonly d: string; readonly width?: number }) {
  return <path d={d} strokeWidth={width} strokeLinecap="round" strokeDasharray="0.1 11" className={`${LINE} stroke-embrun`} />;
}

/** The sign a room's code is written on. Without a code (no room yet) it shows blank dots, never an example. */
export function CodeSign({ x, y, width, height, code }: { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly code?: string }) {
  const centre = x + width / 2;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} rx="5" strokeWidth="1.5" className={`${SURFACE} fill-abysse stroke-voile`} />
      {code === undefined
        ? Array.from({ length: 6 }, (_, index) => <circle key={index} cx={centre - 35 + index * 14} cy={y + height / 2} r="2.5" className={`${SOLID} fill-brume`} />)
        : <text x={centre} y={y + height / 2 + 6} textAnchor="middle" className={`${SOLID} fill-ecume font-mono text-[16px] tracking-[0.22em]`}>{code}</text>}
    </g>
  );
}
