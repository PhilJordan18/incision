/**
 * Nautical primitives of the art direction C1 « Cap » (docs/da/v2). All decorative: `aria-hidden`,
 * static, `pointer-events: none`, tokens only, system colours in forced colours. Each component
 * documents its props in its file's header comment.
 */
export { Coast } from "./coast";
export { Compass } from "./compass";
export { Pennant, SpectatorEye } from "./pennant";
export { Quay, type QuayHull } from "./quay";
export { type NauticalColour, type NauticalDash, type NauticalKind, type NauticalRoute, QUAY_MAX_HULLS, quayBerths, type SailShape, sailShape } from "./shapes";
export { Ship, SHIP_ANCHOR } from "./ship";
export { WaveMarks } from "./wave-marks";
