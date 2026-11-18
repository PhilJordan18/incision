import { CodeSign, Isle, LINE, SeaChart } from "./scene-parts";
import { GlassCompass, SceneShip, WaveField } from "./sea-marks";

/**
 * The small chart beside « Rejoindre la salle » (mock-up `rejoindre`): the visitor's ship on
 * its way to the room, whose sign carries the real code of the page.
 */
export function JoinChart({ code, className }: { readonly code: string; readonly className?: string }) {
  return (
    <SeaChart scene="join-chart" className={className}>
      <svg viewBox="0 0 560 400" fill="none" focusable="false" className="block h-auto w-full">
        <WaveField width={560} height={400} count={18} />
        <path d="M96 352 C180 300 250 250 330 206" strokeWidth="3" strokeLinecap="round" strokeDasharray="0.1 14" className={`${LINE} stroke-moi`} />
        <g transform="translate(390 150) scale(1.25)">
          <Isle wide />
          <CodeSign x={-70} y={-74} width={140} height={38} code={code} />
          <path d="M-40 -36 V-14 M40 -36 V-14" strokeWidth="2" className={`${LINE} stroke-voile`} />
          <SceneShip transform="translate(-58 34) scale(1.3)" />
          <SceneShip transform="translate(-14 38) scale(1.3)" />
          <SceneShip transform="translate(34 36) scale(1.3)" bot />
        </g>
        <SceneShip transform="translate(96 346) scale(2.6)" sail="fill-moi" />
        <GlassCompass transform="translate(470 330)" />
      </svg>
    </SeaChart>
  );
}
