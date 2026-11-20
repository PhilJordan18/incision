import type { Locale } from "./locale";

/**
 * Words drawn inside the C1 room-entry scenes (docs/da/v2, card DA2-6). The scenes are
 * decorative and hidden from assistive technology: the same information is in the form beside.
 */
type Copy = {
  /** Captions of the chart of the three accesses, beside « Créer une salle ». */
  chart: { public: string; code: string; private: string; north: string };
};

const fr: Copy = { chart: { public: "01 · Salle publique", code: "02 · Sur code", private: "03 · Privée", north: "N" } };
const en: Copy = { chart: { public: "01 · Public room", code: "02 · By code", private: "03 · Private", north: "N" } };

export function roomEntryCopy(locale: Locale): Copy { return locale === "fr" ? fr : en; }
