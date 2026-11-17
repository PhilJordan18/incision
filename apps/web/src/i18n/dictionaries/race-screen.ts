import type { Locale } from "../locale";

/** The race screen's own strings: « Ta frappe », the standings and bonus panels and the presence dialog. */
export type RaceScreenMessages = {
  /** Beside « Ta frappe » while it takes keys but has not the focus: how to come back. */
  readonly focusHint: string;
  /** Beside « Ta frappe » while it has the focus. */
  readonly typingHint: string;
  readonly standingsHeading: string;
  /** The standings follow the progress; the final ranking is the results'. */
  readonly standingsNote: string;
  readonly standingsEmpty: string;
  /** The rank's prefix for assistive technology, before its number. */
  readonly rank: string;
  /** The presence dialog's label, over its question. */
  readonly presenceLabel: string;
  /** Beside « Ta frappe » while the presence dialog is open: the question where the eyes are. */
  readonly presenceHint: string;
  /** How to get back to the text without answering. */
  readonly presenceBack: string;
  /** What each bonus does (D-11), beside its name in the bonus panel. */
  readonly bonusEffects: { readonly shortenSelf: string; readonly extendLeader: string; readonly fogLeader: string };
  /** The first bonus, usable now with Enter in « Ta frappe » (D-16). */
  readonly bonusReady: string;
  /** A later bonus, used after the ones before it. */
  readonly bonusQueued: string;
  /** The first bonus while it cannot be used (not racing, another tab, synchronising). */
  readonly bonusWaiting: string;
  /** The panel's scrolling log, for assistive technology. */
  readonly bonusLog: string;
};

export const raceScreenMessages = {
  fr: {
    focusHint: "Pour reprendre, clique dans « Ta frappe » ou sur le texte, ou appuie sur Échap depuis le texte ou un panneau.",
    typingHint: "Tape le texte ci-dessus : il montre ta progression. Coller est désactivé, et Entrée ne tape rien.",
    standingsHeading: "Classement",
    standingsNote: "En direct, selon la progression. Le classement final vient avec les résultats.",
    standingsEmpty: "En attente de la progression…",
    rank: "Rang",
    presenceLabel: "Rappel d’activité",
    presenceHint: "Tu es toujours là ? Tape une touche dans « Ta frappe », ou réponds « Je suis là » juste en dessous.",
    presenceBack: "Échap ramène à « Ta frappe » sans répondre.",
    bonusEffects: {
      shortenSelf: "Retire jusqu’à 3 mots pas encore commencés de ton texte.",
      extendLeader: "Ajoute 3 mots au texte du meneur.",
      fogLeader: "Masque les prochains mots du meneur pendant 3 s.",
    },
    bonusReady: "prêt · Entrée",
    bonusQueued: "en réserve",
    bonusWaiting: "en attente",
    bonusLog: "Journal des bonus",
  },
  en: {
    focusHint: "To resume, click in “Your typing” or on the text, or press Escape from the text or a panel.",
    typingHint: "Type the text above: it shows your progress. Pasting is off, and Enter types nothing.",
    standingsHeading: "Standings",
    standingsNote: "Live, by progress. The final ranking comes with the results.",
    standingsEmpty: "Waiting for progress…",
    rank: "Rank",
    presenceLabel: "Activity reminder",
    presenceHint: "Are you still there? Type a key in “Your typing”, or answer “I’m here” just below.",
    presenceBack: "Escape takes you back to “Your typing” without answering.",
    bonusEffects: {
      shortenSelf: "Removes up to 3 words you have not started from your text.",
      extendLeader: "Adds 3 words to the leader’s text.",
      fogLeader: "Hides the leader’s next words for 3 s.",
    },
    bonusReady: "ready · Enter",
    bonusQueued: "in reserve",
    bonusWaiting: "waiting",
    bonusLog: "Bonus log",
  },
} satisfies Record<Locale, RaceScreenMessages>;
