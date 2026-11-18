import { Course, Isle, Lighthouse, SeaChart } from "./scene-parts";
import { SceneShip, WaveField } from "./sea-marks";

/**
 * The fleet heading for the public harbour, in the two columns beside the matchmaking card
 * (mock-up `salles-publiques`). Hidden under 640 px. The ships are a drawing, not the rooms
 * of the list: the list below is the only place that says what is open.
 */
export function FleetScene({ className = "" }: { readonly className?: string }) {
  return (
    <SeaChart scene="fleet" className={`hidden sm:flex ${className}`}>
      {/* The whole fleet always fits (no cropping); the waves run past the drawing to fill a taller or wider box. */}
      <svg viewBox="0 0 860 240" fill="none" focusable="false" className="size-full min-h-[200px]">
        <g transform="translate(-430 -240)"><WaveField width={1720} height={720} count={150} start={[238, 136]} step={[1268, 399]} /></g>
        <Course d="M150 152 C270 142 600 150 700 132" />
        <Course d="M272 114 C392 104 600 150 700 132" />
        <Course d="M350 178 C470 168 600 150 700 132" />
        <g transform="translate(730 150) scale(1.1)">
          <Isle wide />
          <Lighthouse transform="translate(0 -28)" />
        </g>
        <SceneShip transform="translate(120 150) scale(2.2)" sail="fill-moi" />
        <SceneShip transform="translate(250 112) scale(1.6)" />
        <SceneShip transform="translate(330 176) scale(1.5)" bot />
        <SceneShip transform="translate(440 128) scale(1.3)" />
        <SceneShip transform="translate(520 168) scale(1.1)" />
      </svg>
    </SeaChart>
  );
}
