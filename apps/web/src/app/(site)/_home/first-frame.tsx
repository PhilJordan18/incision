import type { ReactNode } from "react";
import styles from "./home.module.css";
import { GlassCompass, sceneCaption, SceneShip, type SailTone } from "./scene-parts";

export const HOME_CONTAINER = "mx-auto w-full max-w-page px-4 sm:px-8 lg:px-12";

type FleetShip = { readonly x: number; readonly y: number; readonly scale: number; readonly tone: SailTone; readonly bot?: boolean; readonly flag?: boolean };

/** The fleet heading for the coast: the nearer a ship, the larger. Mine is the only coloured sail. */
const WIDE_FLEET: readonly FleetShip[] = [
  { x: 800, y: 470, scale: 3.3, tone: "moi" },
  { x: 1030, y: 362, scale: 2.3, tone: "ecume" },
  { x: 905, y: 264, scale: 1.6, tone: "ecume" },
  { x: 1150, y: 252, scale: 1.4, tone: "ecume", bot: true },
  { x: 1345, y: 300, scale: 1.5, tone: "brume" },
  { x: 990, y: 176, scale: 0.9, tone: "brume", flag: false },
  { x: 1190, y: 162, scale: 0.8, tone: "brume", flag: false },
  { x: 850, y: 154, scale: 0.75, tone: "brume", flag: false },
  { x: 1075, y: 122, scale: 0.55, tone: "brume", flag: false },
  { x: 1280, y: 126, scale: 0.55, tone: "brume", flag: false },
  { x: 715, y: 200, scale: 1, tone: "brume", flag: false },
];
/** The same fleet gathered to the right, for the widths where the title takes more of the frame. */
const COMPACT_FLEET: readonly FleetShip[] = [
  { x: 1082, y: 470, scale: 3.3, tone: "moi" },
  { x: 1198, y: 362, scale: 2.3, tone: "ecume" },
  { x: 1135, y: 264, scale: 1.6, tone: "ecume" },
  { x: 1258, y: 252, scale: 1.4, tone: "ecume", bot: true },
  { x: 1355, y: 300, scale: 1.5, tone: "brume" },
  { x: 1178, y: 176, scale: 0.9, tone: "brume", flag: false },
  { x: 1278, y: 162, scale: 0.8, tone: "brume", flag: false },
  { x: 1108, y: 154, scale: 0.75, tone: "brume", flag: false },
  { x: 1220, y: 122, scale: 0.55, tone: "brume", flag: false },
  { x: 1322, y: 126, scale: 0.55, tone: "brume", flag: false },
  { x: 1040, y: 200, scale: 1, tone: "brume", flag: false },
];
/** Stacked under 1024 px and from 1280 px: the wide fleet. Between the two: the compact one. */
const WIDE_ONLY = "lg:hidden xl:block";
const COMPACT_ONLY = "hidden lg:block xl:hidden";

const HORIZONS = "M0 96H1440M0 132H1440M0 190H1440M0 285H1440M0 430H1440";
/** Chart lines converging on the coast. */
const BEARINGS = Array.from({ length: 20 }, (_, line) => `M${-1200 + line * 220} 620 ${852 + line * 11} 62`).join("");
const COAST = "68 55.5 123 58.8 209 62 272 65.2 310 68.5 380 71.8 427 75 505 49 560 52.2 646 55.5 708 58.8 747 62 817 65.2 864 68.5 942 71.8 996 75 1083 49 1145 52.2 1184 55.5 1254 58.8 1300 62 1379 65.2 1433 68.5 1450 62";

type FirstFrameProps = { readonly finish: string; readonly heading: string; readonly children: ReactNode };

/**
 * First frame of the home (C1 « Cap »): the fleet and the red coast behind the title and the
 * entry actions. The scene is decorative and static; under 1024 px it sits above the text.
 */
export function FirstFrame({ finish, heading, children }: FirstFrameProps) {
  const caption = `${heading} · ${finish}`;
  return (
    <div className="relative lg:min-h-[max(600px,41.7vw)] lg:overflow-hidden">
      <svg
        viewBox="0 0 1440 600"
        preserveAspectRatio="xMaxYMin slice"
        fill="none"
        aria-hidden="true"
        focusable="false"
        className={`${styles.scene} pointer-events-none block h-[max(300px,41.7vw)] w-full lg:absolute lg:inset-0 lg:h-full`}
      >
        <rect width="1440" height="600" className={`${styles.backdrop} fill-mer`} />
        <path d={HORIZONS} className={`${styles.backdrop} stroke-houle`} opacity="0.34" />
        <path d={BEARINGS} className={`${styles.backdrop} stroke-houle`} opacity="0.3" />
        <path d="M1085 520q26-30 62-18 34-16 52 12 10 22-22 28-52 14-92-2ZM690 330q18-16 38-6 16 10 2 20-26 10-40-14Z" className="fill-sillage stroke-houle" strokeWidth="1.5" />
        <g className={WIDE_ONLY}>
          <path d="M800 500 704 640" className="stroke-moi" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 15" />
          {WIDE_FLEET.map((ship) => (
            <SceneShip key={`${ship.x}-${ship.y}`} {...ship} />
          ))}
        </g>
        <g className={COMPACT_ONLY}>
          <path d="M1082 500 1155 640" className="stroke-moi" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 15" />
          {COMPACT_FLEET.map((ship) => (
            <SceneShip key={`${ship.x}-${ship.y}`} {...ship} />
          ))}
        </g>
        {/* On Abysse the sea fades into the page behind the title; Aube keeps the sea everywhere. */}
        <linearGradient id="home-sea-fade">
          <stop offset="0.4" className="[stop-color:var(--color-abysse)]" />
          <stop offset="0.56" className="[stop-color:var(--color-abysse)]" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="home-sea-fade-compact">
          <stop offset="0.6" className="[stop-color:var(--color-abysse)]" />
          <stop offset="0.7" className="[stop-color:var(--color-abysse)]" stopOpacity="0" />
        </linearGradient>
        <g className={`${styles.backdrop} only-abysse`}>
          <rect width="1440" height="600" fill="url(#home-sea-fade)" className={WIDE_ONLY} />
          <rect width="1440" height="600" fill="url(#home-sea-fade-compact)" className={COMPACT_ONLY} />
        </g>
        <path className={styles.land} d={`M-10-10V52.2L${COAST}V-10Z`} />
        <path className={styles.coastline} d={`M-10 52.2 ${COAST}`} />
        <text x="1392" y="34" textAnchor="end" className="fill-erreur font-mono text-[13px] font-bold tracking-[0.2em] uppercase">
          {finish}
        </text>
        <g className={WIDE_ONLY}>
          <GlassCompass x={1290} y={462} needle={-58} />
          <text x="1290" y="560" textAnchor="middle" className={sceneCaption}>
            {caption}
          </text>
        </g>
        <g className={COMPACT_ONLY}>
          <GlassCompass x={1356} y={470} scale={0.8} needle={-58} />
          <text x="1356" y="552" textAnchor="middle" className={sceneCaption}>
            {caption}
          </text>
        </g>
      </svg>
      <div className={`${HOME_CONTAINER} relative pt-5 pb-8 lg:pt-24 lg:pb-10 xl:pt-[100px] short:pt-20`}>{children}</div>
    </div>
  );
}
