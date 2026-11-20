import { LINE } from "./scene-parts";

/**
 * The sea's texture inside a room-entry scene: the mock-ups' lattice of short strokes, denser
 * than the shared `WaveMarks` (one row, for a title band or a panel corner) because it fills a
 * whole chart. Decorative only.
 */
type WaveFieldProps = {
  readonly width: number;
  readonly height: number;
  readonly count: number;
  /** Where the lattice starts, so two scenes do not share one pattern. */
  readonly start?: readonly [number, number];
  /** Distance between two consecutive marks; the default is the mock-ups' lattice. */
  readonly step?: readonly [number, number];
  /** Marks left out, by their place in the lattice: one that would sit against a caption and read as part of it. */
  readonly skip?: readonly number[];
};

/** Short wave strokes scattered on a fixed lattice (no randomness: server and browser draw the same). */
export function WaveField({ width, height, count, start = [114, 68], step = [97, 61], skip = [] }: WaveFieldProps) {
  return (
    <g strokeWidth="1.5" strokeLinecap="round" className={`${LINE} stroke-houle [[data-theme=aube]_&]:stroke-ombre`}>
      {Array.from({ length: count }, (_, index) => {
        if (skip.includes(index)) return null;
        const x = 20 + ((start[0] + step[0] * index) % (width - 40));
        const y = 10 + ((start[1] + step[1] * index) % (height - 20));
        return <path key={index} d={`M${x} ${y} q6 -6 12 0 q6 6 12 0`} />;
      })}
    </g>
  );
}
