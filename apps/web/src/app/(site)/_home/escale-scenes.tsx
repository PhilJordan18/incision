import type { ReactNode } from "react";
import styles from "./home.module.css";
import { GlassCompass, Isle, Lighthouse, sceneCaption, sceneCaptionTight, SceneShip } from "./scene-parts";

/**
 * The four drawings of the route map (C1 « Cap »). Each one is decorative: `aria-hidden`, static,
 * and it only repeats what the text beside it says. The words drawn in a scene come from the
 * FR/EN dictionaries; no scene shows a name, a speed or a rank, because the home has no data.
 */

const figure = `${styles.scene} pointer-events-none block h-auto w-full`;
const LABEL = "fill-ecume font-sans text-[15px] font-semibold max-md:text-[19px]";
const KEY_TEXT = "font-mono text-[14px] max-md:text-[17px]";

function Figure({ name, viewBox, children }: { readonly name: string; readonly viewBox: string; readonly children: ReactNode }) {
  return (
    <svg data-scene={name} viewBox={viewBox} fill="none" aria-hidden="true" focusable="false" className={figure}>
      {children}
    </svg>
  );
}

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

function House({ x, y, scale = 1 }: { readonly x: number; readonly y: number; readonly scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <rect x="-6" y="-8" width="12" height="9" className="fill-embrun" />
      <path d="M-8-8 0-15 8-8Z" className="fill-ecume" />
    </g>
  );
}

function Tree({ x, y }: { readonly x: number; readonly y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0V-8" className="stroke-brume" strokeWidth="2" />
      <circle cy="-12" r="6" className="fill-voile" />
    </g>
  );
}

const ROSE_POINTS = [0, 45, 90, 135, 180, 225, 270, 315];

function CompassRose({ x, y, north }: { readonly x: number; readonly y: number; readonly north: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(.5)`} className="stroke-brume" strokeWidth="1.2">
      <circle r="59" strokeDasharray="1 5" />
      <circle r="10" />
      {ROSE_POINTS.map((angle) => (
        <path key={angle} transform={`rotate(${angle})`} d={angle % 90 === 0 ? "M-3.8-9.2 0-50 3.8-9.2" : "M-3.8-9.2 0-27.4 3.8-9.2"} />
      ))}
      <text y="-65" textAnchor="middle" className="fill-brume font-mono text-[18px]" stroke="none">
        {north}
      </text>
    </g>
  );
}

export type AccessSceneWords = { readonly publicRoom: string; readonly byCode: string; readonly privateRoom: string; readonly code: string; readonly north: string };

/** Escale 01: three isles, one per way into a room (listed, by code, by invitation). */
export function AccessScene({ words }: { readonly words: AccessSceneWords }) {
  return (
    <Figure name="access" viewBox="0 0 600 460">
      <path d="M75 0V460M150 0V460M225 0V460M300 0V460M375 0V460M450 0V460M525 0V460M0 75H600M0 150H600M0 225H600M0 300H600M0 375H600M0 450H600" className="stroke-houle" opacity="0.35" />
      <g className="stroke-embrun" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 11">
        <path d="M190 396C200 330 250 250 256 200" />
        <path d="M190 396C230 380 290 360 318 326" />
        <path d="M190 396C330 420 440 320 446 216" />
      </g>
      <Isle x={150} y={150} scale={1.2} />
      <Lighthouse x={96} y={92} />
      <House x={150} y={132} />
      <House x={170} y={126} scale={1.15} />
      <House x={192} y={134} />
      <Tree x={128} y={140} />
      <Tree x={210} y={142} />
      <path d="M214 168 262 190" className="stroke-embrun" strokeWidth="4" strokeLinecap="round" />
      <path d="M226 174v10M240 180v10M254 186v10" className="stroke-brume" strokeWidth="2" />
      <SceneShip x={276} y={176} scale={0.75} tone="ecume" />
      <SceneShip x={236} y={208} scale={0.6} tone="brume" />
      <SceneShip x={196} y={214} scale={0.55} tone="brume" />
      <Isle x={340} y={318} scale={1.05} />
      <path d="M300 300V282h8v6h8v-6h8v6h8v-6h8v6h8v-6h8v6h8v-6h8V300Z" className="fill-embrun" />
      <path d="M332 300v-9a6 6 0 0 1 12 0v9Z" className="fill-abysse" />
      <path d="M338 282V250" className="stroke-ecume" strokeWidth="2" />
      <rect x="282" y="222" width="112" height="30" rx="5" className="fill-abysse stroke-voile" strokeWidth="1.5" />
      <text x="338" y="243" textAnchor="middle" className="fill-ecume font-mono text-[16px] tracking-[0.22em] uppercase max-md:text-[18px]">
        {words.code}
      </text>
      <Isle x={486} y={132} scale={0.95} />
      <circle cx="486" cy="128" r="94" className="stroke-embrun" strokeDasharray="3 8" strokeWidth="1.5" />
      <path d="M386 96l6-10 6 10ZM402 196l6-10 6 10ZM556 84l6-10 6 10ZM566 176l6-10 6 10ZM470 222l6-10 6 10ZM428 50l6-10 6 10Z" className="fill-voile" />
      <path d="M478 122V96h16V122Z" className="fill-embrun" />
      <path d="M474 96 486 80 498 96Z" className="fill-ecume" />
      <rect x="483" y="104" width="6" height="8" className="fill-abysse" />
      <Tree x={512} y={126} />
      <Tree x={456} y={128} />
      <g transform="translate(470 286) rotate(-14)">
        <rect x="-22" y="-15" width="44" height="30" rx="3" className="fill-nuit stroke-ecume" strokeWidth="1.5" />
        <path d="M-22-13 0 3 22-13" className="stroke-ecume" strokeWidth="1.5" />
        <circle cy="5" r="5" className="fill-ligne" />
      </g>
      <CompassRose x={540} y={400} north={words.north} />
      <SceneShip x={190} y={420} scale={1.9} tone="moi" />
      <text x="120" y="262" textAnchor="middle" className={sceneCaption}>{`01 · ${words.publicRoom}`}</text>
      <text x="338" y="376" textAnchor="middle" className={sceneCaption}>{`02 · ${words.byCode}`}</text>
      <text x="486" y="250" textAnchor="middle" className={sceneCaption}>{`03 · ${words.privateRoom}`}</text>
    </Figure>
  );
}

export type ModesSceneWords = {
  readonly training: string;
  readonly noBonuses: string;
  readonly arcade: string;
  readonly bonusesAtMilestones: string;
  /** From the finish down to the start: fog, extension, shortcut. */
  readonly bonuses: readonly [BonusWords, BonusWords, BonusWords];
};
type BonusWords = { readonly name: string; readonly milestone: string };

const BONUS_ICONS = [
  <path key="fog" d="M3 8c3-3 6 3 9 0s6 3 9 0M3 14c3-3 6 3 9 0s6 3 9 0" />,
  <g key="extend">
    <circle cx="12" cy="5" r="2" />
    <path d="M12 7v13M5 13a7 7 0 0 0 14 0M8 11h8" />
  </g>,
  <path key="shorten" d="M5 19 19 5M12 5h7v7" />,
];
const BONUS_PLACES = [
  { x: 366, y: 148 },
  { x: 352, y: 250 },
  { x: 366, y: 352 },
];

/** Escale 02: a calm training lane beside an Arcade lane with its three bonus buoys. */
export function ModesScene({ words }: { readonly words: ModesSceneWords }) {
  return (
    <Figure name="modes" viewBox="0 0 600 460">
      <g className="fill-brume">
        <circle cx="40" cy="60" r="1.5" />
        <circle cx="96" cy="34" r="1" />
        <circle cx="150" cy="78" r="1.5" />
        <circle cx="214" cy="40" r="1" />
        <circle cx="250" cy="96" r="1.5" />
        <circle cx="70" cy="120" r="1" />
        <circle cx="190" cy="130" r="1" />
      </g>
      <circle cx="216" cy="78" r="20" className="stroke-embrun" strokeWidth="1.5" />
      <path d="M226 62a20 20 0 1 0 8 26 15 15 0 0 1-8-26" className="fill-embrun" opacity="0.5" />
      <path d="M30 300h70M130 322h110M60 356h50M170 380h80M40 410h120M200 290h50" className="stroke-houle" strokeWidth="2" strokeLinecap="round" />
      <path d="M150 440C140 380 158 320 150 262" className="stroke-embrun" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 11" />
      <SceneShip x={150} y={248} scale={2.4} tone="ecume" />
      <path
        d="M330 300q13-11 26 0t26 0 26 0M318 392q13-11 26 0t26 0 26 0 26 0M452 430q13-11 26 0t26 0 26 0 26 0M330 196q13-11 26 0t26 0M440 250q13-11 26 0t26 0M330 96q13-11 26 0t26 0"
        className="stroke-houle"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path d="M530 440C514 340 546 220 530 96" className="stroke-arcade" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 11" />
      <circle cx="532" cy="86" r="26" className="stroke-or" strokeWidth="3" />
      <SceneShip x={532} y={96} scale={1.3} tone="ecume" />
      <g className="fill-brume" opacity="0.3">
        <rect x="430" y="54" width="170" height="15" rx="7.5" />
        <rect x="462" y="76" width="150" height="15" rx="7.5" />
        <rect x="440" y="98" width="130" height="15" rx="7.5" />
      </g>
      {BONUS_PLACES.map(({ x, y }, index) => (
        <g key={y}>
          <path d={`M${x + 24} ${y}H530`} className="stroke-arcade" strokeDasharray="2 6" opacity="0.7" />
          <g transform={`translate(${x} ${y})`}>
            <path d="M-30 26q8-7 15 0t15 0 15 0 15 0" className="stroke-houle" strokeWidth="2" strokeLinecap="round" />
            <path d="M0-24V-44l14 5-14 5" className="fill-arcade stroke-arcade" strokeWidth="2" strokeLinejoin="round" />
            <circle r="24" className="fill-nuit stroke-arcade" strokeWidth="2" />
            <g className="stroke-arcade" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" transform="translate(-12 -12)">
              {BONUS_ICONS[index]}
            </g>
            <text x="36" y="-2" className={LABEL}>{words.bonuses[index]?.name}</text>
            <text x="36" y="15" className={sceneCaptionTight}>{words.bonuses[index]?.milestone}</text>
          </g>
        </g>
      ))}
      <circle cx="530" cy="350" r="34" className="stroke-moi" strokeWidth="2" opacity="0.6" />
      <SceneShip x={530} y={362} scale={1.9} tone="moi" />
      <path d="M296 0q-14 40 0 80t0 80 0 80 0 80 0 80 0 80" className="stroke-houle" strokeWidth="2" strokeDasharray="2 8" />
      <text x="150" y="28" textAnchor="middle" className={sceneCaption}>{words.training}</text>
      <text x="150" y="46" textAnchor="middle" className={sceneCaption}>{words.noBonuses}</text>
      <text x="450" y="28" textAnchor="middle" className={`${sceneCaption} !fill-arcade`}>{words.arcade}</text>
      <text x="450" y="46" textAnchor="middle" className={sceneCaption}>{words.bonusesAtMilestones}</text>
    </Figure>
  );
}

export type TypingSceneWords = { readonly rows: readonly [string, string, string]; readonly recentKeys: string; readonly nextKey: string };

const ROW_STARTS = [96, 112, 148];
const TRACK_ROUTES = [
  { from: 120, to: 100, y: 70, scale: 1, tone: "ecume", className: "stroke-ecume", width: 2 },
  { from: 318, to: 300, y: 96, scale: 1.4, tone: "moi", className: "stroke-moi", width: 3.5 },
  { from: 470, to: 490, y: 82, scale: 1, tone: "ecume", className: "stroke-ecume", width: 2, dash: "7 4", bot: true },
  { from: 212, to: 196, y: 118, scale: 0.8, tone: "brume", className: "stroke-brume", width: 1.5, dash: "1 4" },
  { from: 400, to: 392, y: 126, scale: 0.7, tone: "brume", className: "stroke-brume", width: 1.5, dash: "1 4" },
] as const;

/** Escale 03: a small track under the text sheet, and the keyboard that moves my ship. */
export function TypingScene({ words }: { readonly words: TypingSceneWords }) {
  const nextKeyX = (() => {
    for (const [row, letters] of words.rows.entries()) {
      const column = letters.indexOf(words.nextKey);
      if (column >= 0) {
        return { x: (ROW_STARTS[row] ?? 0) + column * 40 + 17, y: 196 + row * 38 };
      }
    }
    return undefined;
  })();
  return (
    <Figure name="typing" viewBox="0 0 600 348">
      <rect width="600" height="168" rx="12" className="fill-abysse stroke-houle" />
      <clipPath id="home-track-clip">
        <rect width="600" height="168" rx="12" />
      </clipPath>
      <g clipPath="url(#home-track-clip)">
        <path className={styles.land} d="M-10-10V30L41 18l33 1.5 56 1.5 39 1.5 63 1.5 44 1.5 28 1.5 51 1.5 33 1.5L444 18l39 1.5 62 1.5 45 1.5 20 1.5V-10Z" />
        <path className={styles.coastline} strokeWidth="3" d="M-10 30 41 18l33 1.5 56 1.5 39 1.5 63 1.5 44 1.5 28 1.5 51 1.5 33 1.5L444 18l39 1.5 62 1.5 45 1.5 20 1.5" />
        {TRACK_ROUTES.map((route) => {
          const middle = (168 + route.y) / 2;
          return (
            <g key={route.from}>
              <path
                d={`M${route.from} 168C${route.from} ${middle} ${route.to} ${middle} ${route.to} ${route.y}`}
                className={route.className}
                strokeWidth={route.width}
                strokeLinecap="round"
                strokeDasharray={"dash" in route ? route.dash : undefined}
              />
              <SceneShip x={route.to} y={route.y} scale={route.scale} tone={route.tone} bot={"bot" in route} />
            </g>
          );
        })}
        <circle cx="300" cy="90" r="30" className="stroke-moi" strokeWidth="2" opacity="0.6" />
      </g>
      <text x="24" y="150" className="font-display text-[30px] font-black">
        <tspan className="fill-voile">3 · 2 · </tspan>
        <tspan className="fill-ecume">1</tspan>
      </text>
      {words.rows.map((letters, row) =>
        [...letters].map((letter, column) => {
          const x = (ROW_STARTS[row] ?? 0) + column * 40;
          const y = 196 + row * 38;
          const next = letter === words.nextKey;
          const recent = words.recentKeys.includes(letter);
          return (
            <g key={letter}>
              <rect
                x={x}
                y={y}
                width="34"
                height="32"
                rx="6"
                className={next ? "fill-moi stroke-moi" : recent ? "fill-nuit stroke-moi" : "fill-nuit stroke-houle"}
                strokeWidth={next || recent ? 2 : 1}
              />
              <text x={x + 17} y={y + 21} textAnchor="middle" className={`${KEY_TEXT} ${next ? "fill-abysse" : recent ? "fill-ecume" : "fill-brume"}`}>
                {letter}
              </text>
              {recent && <path d={`M${x + 8} ${y + 28}h18`} className="stroke-juste" strokeWidth="3" strokeLinecap="round" />}
            </g>
          );
        }),
      )}
      <rect x="188" y="310" width="224" height="30" rx="6" className="fill-nuit stroke-houle" />
      {nextKeyX !== undefined && (
        <path
          d={`M${nextKeyX.x} ${nextKeyX.y}C${nextKeyX.x} ${nextKeyX.y - 20} 318 180 310 116`}
          className="stroke-moi"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeDasharray="0.1 9"
        />
      )}
    </Figure>
  );
}

export type LogbookSceneWords = {
  readonly logbook: string;
  readonly netWpm: string;
  readonly accuracy: string;
  readonly record: string;
  readonly curve: string;
  readonly keys: readonly [string, string];
  readonly missedKeys: string;
};

const PAGE_LINES = range(11).map((line) => 104 + line * 28);
const SMALL_CAPTION = "font-mono text-[8.5px] tracking-[0.14em] uppercase max-md:text-[10px] max-md:tracking-[0.02em]";
/** The three pennant shapes of the vocabulary: human, bot, me. No name beside them: the home has no runner. */
const PENNANTS = [
  <path key="human" d="M2-11 22-3 2 5Z" className="fill-or" />,
  <rect key="bot" x="2" y="-11" width="18" height="15" rx="1.5" className="fill-ecume" />,
  <path key="me" d="M2-11H24L17-3 24 5H2Z" className="fill-moi" />,
];

/** Escale 04: an open logbook. It shows shapes only, never a figure. */
export function LogbookScene({ words }: { readonly words: LogbookSceneWords }) {
  const keys = [...words.keys[0]].map((letter, column) => ({ letter, x: 330 + column * 37, y: 326, missed: false }));
  const secondRow = [...words.keys[1], ...words.missedKeys].map((letter, column) => ({ letter, x: 330 + column * 37, y: 362, missed: column >= words.keys[1].length }));
  return (
    <Figure name="logbook" viewBox="0 0 600 460">
      <path d="M24 74 296 58V422L24 438ZM304 58 576 74V438L304 422Z" className="fill-houle" opacity="0.6" />
      <path d="M34 62 296 46V410L34 426Z" className="fill-nuit stroke-houle" strokeWidth="1.5" />
      <path d={PAGE_LINES.map((y) => `M52 ${y}H280`).join("")} className="stroke-houle" opacity="0.45" />
      <text x="56" y="92" className={sceneCaption}>{words.logbook}</text>
      <path d="M56 100H276" className="stroke-houle" strokeWidth="3" />
      <path d="M56 105H276" className="stroke-houle" />
      <path d="M64 150V262" className="stroke-ecume" strokeWidth="4" strokeLinecap="round" />
      <path d="M68 154 214 194 68 234Z" className="fill-moi" />
      {PENNANTS.map((pennant, index) => (
        <g key={pennant.key} transform={`translate(62 ${306 + index * 32})`}>
          <path d="M0-12V8" className="stroke-ecume" strokeWidth="1.5" strokeLinecap="round" />
          {pennant}
          <path d="M34-2H214" className="stroke-houle" strokeWidth="6" strokeLinecap="round" />
        </g>
      ))}
      <path d="M304 46 566 62V426L304 410Z" className="fill-nuit stroke-houle" strokeWidth="1.5" />
      <path d={PAGE_LINES.map((y) => `M320 ${y}H548`).join("")} className="stroke-houle" opacity="0.45" />
      {[words.netWpm, words.accuracy, `★ ${words.record}`].map((label, index) => {
        const record = index === 2;
        return (
          <g key={label} transform={`translate(${328 + index * 76} 84)`}>
            <rect width="70" height="62" rx="8" className={record ? "fill-abysse stroke-or" : "fill-abysse stroke-houle"} strokeWidth={record ? 2 : 1} />
            <text x="10" y="20" className={`${SMALL_CAPTION} ${record ? "fill-or" : "fill-brume"}`}>{label}</text>
            <path d="M10 44H52" className={record ? "stroke-or" : "stroke-houle"} strokeWidth="7" strokeLinecap="round" />
          </g>
        );
      })}
      <text x="330" y="186" className={sceneCaption}>{words.curve}</text>
      <path d="M330 304H544" className="stroke-sillage" strokeWidth="2" />
      <polyline points="330,300 356,290 382,294 408,274 434,278 460,258 486,262 512,238 538,226" className="stroke-moi" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="538" cy="226" r="5" className="fill-or" />
      {[...keys, ...secondRow].map(({ letter, x, y, missed }) => (
        <g key={`${x}-${y}`}>
          <rect x={x} y={y} width="31" height="30" rx="5" className={missed ? `${styles.land} stroke-erreur` : "fill-abysse stroke-houle"} strokeWidth={missed ? 2 : 1} />
          <text x={x + 15.5} y={y + 20} textAnchor="middle" className={`${KEY_TEXT} ${missed ? "fill-erreur" : "fill-brume"}`}>{letter}</text>
          {/* An error is never colour alone: the missed keys also carry the wavy underline. */}
          {missed && <path d={`M${x + 8} ${y + 26}q2.5-3 5 0t5 0 5 0`} className="stroke-erreur" strokeWidth="1.5" />}
        </g>
      ))}
      <path d="M292 30H308V440L300 430 292 440Z" className="fill-ligne" />
    </Figure>
  );
}

/** The departure quay: the lighthouse, three moored ships, the compass, and mine leaving. */
export function QuayScene() {
  return (
    <svg data-scene="quay" viewBox="0 0 560 300" fill="none" aria-hidden="true" focusable="false" className={`${styles.scene} pointer-events-none block h-auto w-full md:w-[420px] md:flex-none lg:w-[560px]`}>
      <path d="M20 280q13-11 26 0t26 0 26 0 26 0 26 0 26 0M300 290q13-11 26 0t26 0 26 0 26 0 26 0 26 0 26 0 26 0" className="stroke-houle" strokeWidth="2" strokeLinecap="round" />
      <path d="M70 226V262M172 226V262M274 226V262M376 226V262" className="stroke-voile" strokeWidth="5" strokeLinecap="round" />
      <rect x="30" y="196" width="380" height="30" rx="4" className="fill-voile" />
      <path d={range(10).map((plank) => `M${60 + plank * 34} 196V226`).join("")} className="stroke-abysse" strokeWidth="2" />
      <Lighthouse x={64} y={162} scale={1.1} />
      <GlassCompass x={336} y={150} scale={0.62} needle={-90} />
      <SceneShip x={150} y={176} scale={1.3} tone="ecume" />
      <SceneShip x={214} y={178} scale={1.1} tone="brume" />
      <SceneShip x={262} y={180} scale={0.9} tone="brume" bot />
      <path d="M420 208C450 190 470 150 482 110" className="stroke-moi" strokeWidth="2.6" strokeLinecap="round" strokeDasharray="0.1 11" />
      <SceneShip x={486} y={96} scale={2.2} tone="moi" />
    </svg>
  );
}
