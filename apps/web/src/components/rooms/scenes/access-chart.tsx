import type { Locale } from "@/i18n/locale";
import { roomEntryCopy } from "@/i18n/room-entry";
import { CodeSign, Course, House, Isle, Lighthouse, LINE, SeaChart, SOLID, SURFACE, Tree } from "./scene-parts";
import { SceneShip, WaveField } from "./sea-marks";

const GRID = [75, 150, 225, 300, 375, 450, 525];
const CAPTION = `${SOLID} fill-embrun font-mono text-[12px] tracking-[0.2em] uppercase`;
/** The eight points of the compass rose, long on the cardinals. */
const ROSE = Array.from({ length: 8 }, (_, index) => ({ angle: index * 45, reach: index % 2 === 0 ? 50 : 27.4 }));

/**
 * The chart of the three accesses, beside « Créer une salle » (mock-up `creer-salle`): a public
 * harbour under its lighthouse, a fort you enter with a code, an island closed by buoys that
 * only a letter reaches. It repeats the form's three choices and says nothing new.
 */
export function AccessChart({ locale, className }: { readonly locale: Locale; readonly className?: string }) {
  const t = roomEntryCopy(locale).chart;
  return (
    <SeaChart scene="access-chart" className={className}>
      <svg viewBox="0 0 600 460" fill="none" focusable="false" className="block h-auto w-full">
        <g opacity=".35" className="fill-none stroke-houle forced-colors:hidden [[data-theme=aube]_&]:stroke-ombre">
          {GRID.map((x) => <path key={`v${x}`} d={`M${x} 0V460`} />)}
          {GRID.map((y) => <path key={`h${y}`} d={`M0 ${y}H600`} />)}
        </g>
        <WaveField width={600} height={460} count={18} />
        <Course d="M190 396 C200 330 250 250 256 200" width={2.6} />
        <Course d="M190 396 C230 380 290 360 318 326" width={2.6} />
        <Course d="M190 396 C330 420 440 320 446 216" width={2.6} />

        {/* 01 · the public harbour: a lighthouse, houses, a pier with ships coming and going. */}
        <Isle transform="translate(150 150) scale(1.2)" halo />
        <Lighthouse transform="translate(96 92)" />
        <House transform="translate(150 132)" />
        <House transform="translate(170 126) scale(1.15)" />
        <House transform="translate(192 134)" />
        <Tree transform="translate(128 140)" />
        <Tree transform="translate(210 142)" />
        <path d="M214 168 L262 190" strokeWidth="4" strokeLinecap="round" className={`${LINE} stroke-embrun`} />
        <path d="M226 174 v10 M240 180 v10 M254 186 v10" strokeWidth="2" className={`${LINE} stroke-brume`} />
        <SceneShip transform="translate(276 176) scale(0.75)" />
        <SceneShip transform="translate(236 208) scale(0.6)" sail="fill-brume" />
        <SceneShip transform="translate(196 214) scale(0.55)" sail="fill-brume" />

        {/* 02 · the fort: its gate opens with the room's code, which does not exist yet. */}
        <Isle transform="translate(340 318) scale(1.05)" halo />
        <path d="M300 300 V282 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 v6 h8 v-6 h8 V300 Z" className={`${SOLID} fill-embrun`} />
        <path d="M332 300 v-9 a6 6 0 0 1 12 0 v9 Z" className="fill-abysse forced-colors:fill-[Canvas]" />
        <path d="M338 282 V250" strokeWidth="2" className={`${LINE} stroke-ecume`} />
        <CodeSign x={282} y={222} width={112} height={30} />

        {/* 03 · the private island: a ring of buoys, and the invitation that crosses it. */}
        <Isle transform="translate(486 132) scale(0.95)" halo />
        <circle cx="486" cy="128" r="94" strokeDasharray="3 8" strokeWidth="1.5" className={`${LINE} stroke-embrun`} />
        {[[386, 96], [402, 196], [556, 84], [566, 176], [470, 222], [428, 50]].map(([x, y]) =>
          <path key={`${x}-${y}`} d={`M${x} ${y} l6 -10 l6 10 Z`} className={`${SOLID} fill-voile`} />)}
        <path d="M478 122 V96 h16 V122 Z" className={`${SOLID} fill-embrun`} />
        <path d="M474 96 L486 80 L498 96 Z" className={`${SOLID} fill-ecume`} />
        <rect x="483" y="104" width="6" height="8" className="fill-abysse forced-colors:fill-[Canvas]" />
        <Tree transform="translate(512 126)" />
        <Tree transform="translate(456 128)" />
        <g transform="translate(470 286) rotate(-14)">
          <rect x="-22" y="-15" width="44" height="30" rx="3" strokeWidth="1.5" className={`${SURFACE} fill-nuit stroke-ecume`} />
          <path d="M-22 -13 L0 3 L22 -13" strokeWidth="1.5" className={`${LINE} stroke-ecume`} />
          <circle cy="5" r="5" className="fill-ligne forced-colors:fill-[Highlight]" />
        </g>

        <g transform="translate(540 400) scale(.5)">
          <circle r="59" strokeDasharray="1 5" className={`${LINE} stroke-brume`} />
          <circle r="10" className={`${LINE} stroke-brume`} />
          {ROSE.map(({ angle, reach }) => (
            <g key={angle} transform={`rotate(${angle})`}>
              <path d={`M-3.8 -9.2 L0 -${reach} L3.8 -9.2`} className={`${LINE} stroke-brume`} />
              <path d={`M0 0 L0 -${reach} L3.8 -9.2 Z`} opacity="0.5" className={`${SOLID} fill-brume`} />
            </g>
          ))}
          <text y="-65" textAnchor="middle" className={`${SOLID} fill-brume font-mono text-[18px]`}>{t.north}</text>
        </g>

        <SceneShip transform="translate(190 420) scale(1.9)" sail="fill-moi" />
        <text x="120" y="262" textAnchor="middle" className={CAPTION}>{t.public}</text>
        <text x="338" y="376" textAnchor="middle" className={CAPTION}>{t.code}</text>
        <text x="486" y="250" textAnchor="middle" className={CAPTION}>{t.private}</text>
      </svg>
    </SeaChart>
  );
}
