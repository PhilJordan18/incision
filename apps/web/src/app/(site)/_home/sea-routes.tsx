/**
 * Decorative "sea" of the home page (screen 01): dotted orbits, the Red Line and four
 * routes converging on it. Public rooms appear on it as lights once rooms exist (CP-06);
 * until then nothing pretends to be live data.
 */
export function SeaRoutes() {
  return (
    <svg viewBox="0 0 640 560" className="h-auto w-full max-w-[640px]" fill="none" aria-hidden="true" focusable="false">
      <g className="stroke-brume" strokeOpacity="0.28" strokeDasharray="2 8">
        <circle cx="320" cy="300" r="260" />
        <circle cx="320" cy="300" r="180" />
        <circle cx="320" cy="300" r="100" />
      </g>
      <path d="M20 72 L620 56" className="stroke-ligne" strokeWidth="3" />
      <g strokeWidth="2.2" strokeLinecap="round" strokeDasharray="0.1 11" strokeOpacity="0.75">
        <path d="M80 560 C 120 420, 220 300, 300 64" className="stroke-arcade" />
        <path d="M250 560 C 260 420, 300 300, 312 64" className="stroke-or" />
        <path d="M420 560 C 400 420, 340 300, 322 64" className="stroke-moi" />
        <path d="M600 560 C 560 420, 420 300, 330 64" className="stroke-juste" />
      </g>
    </svg>
  );
}
