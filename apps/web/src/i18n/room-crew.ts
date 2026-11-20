import type { Locale } from "./locale";

/** Waiting room, second layout (DA2-5): the crew's two groups and the quay's overflow. */
const fr = {
  participants: "Participants", spectators: "Spectateurs",
  /** Spectators present over their fixed quota (D-22). */
  spectatorCount: "{count} / {max}",
  /** Drawn on the decorative quay once it holds its eight hulls. */
  moored: "+{count} au mouillage",
};
const en: typeof fr = {
  participants: "Participants", spectators: "Spectators", spectatorCount: "{count} / {max}", moored: "+{count} at anchor",
};
export function roomCrewCopy(locale: Locale) { return locale === "fr" ? fr : en; }
