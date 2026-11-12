import type { Locale } from "../locale";

/** The race screen's own strings: the integrated typing zone, the standings panel and the presence dialog. */
export type RaceScreenMessages = {
  /** Under the text while the zone takes keys but has not the focus. */
  readonly focusHint: string;
  /** Under the text while the zone has the focus. */
  readonly typingHint: string;
  readonly standingsHeading: string;
  /** The standings follow the progress; the final ranking is the results'. */
  readonly standingsNote: string;
  readonly standingsEmpty: string;
  /** The rank's prefix for assistive technology, before its number. */
  readonly rank: string;
  /** The presence dialog's label, over its question. */
  readonly presenceLabel: string;
  /** Under the text while the presence dialog is open: the question where the eyes are. */
  readonly presenceHint: string;
  /** How to get back to the text without answering. */
  readonly presenceBack: string;
};

export const raceScreenMessages = {
  fr: {
    focusHint: "Clique dans le texte ou appuie sur Tab pour taper.",
    typingHint: "Tape directement dans le texte. Coller est désactivé, et Entrée ne tape rien.",
    standingsHeading: "Classement",
    standingsNote: "En direct, selon la progression. Le classement final vient avec les résultats.",
    standingsEmpty: "En attente de la progression…",
    rank: "Rang",
    presenceLabel: "Rappel d’activité",
    presenceHint: "Tu es toujours là ? Tape une touche dans le texte, ou réponds « Je suis là » plus bas.",
    presenceBack: "Échap ramène au texte sans répondre.",
  },
  en: {
    focusHint: "Click in the text or press Tab to type.",
    typingHint: "Type straight into the text. Pasting is off, and Enter types nothing.",
    standingsHeading: "Standings",
    standingsNote: "Live, by progress. The final ranking comes with the results.",
    standingsEmpty: "Waiting for progress…",
    rank: "Rank",
    presenceLabel: "Activity reminder",
    presenceHint: "Are you still there? Type a key in the text, or answer “I’m here” below.",
    presenceBack: "Escape takes you back to the text without answering.",
  },
} satisfies Record<Locale, RaceScreenMessages>;
