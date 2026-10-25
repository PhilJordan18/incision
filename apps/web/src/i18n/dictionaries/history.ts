import type { Locale } from "../locale";

/** Scoped dictionary: main dictionaries remain owned by the corpus integration. */
const history = {
  fr: {
    title: "Historique des courses", bold: "Journal de", serif: "bord",
    intro: "Tes courses terminées, de la plus récente à la plus ancienne. Dates et heures en UTC.",
    account: "Retour au compte", open: "Voir les résultats", first: "Revenir aux courses récentes",
    older: "Courses plus anciennes", newer: "Courses plus récentes", navigation: "Pages de l’historique",
    empty: "Aucune course sur cette page.", emptyHelp: "Tes résultats apparaissent ici une fois la course terminée, même si tu as abandonné.",
    invalid: "Cette page d’historique n’est pas valide.", unavailable: "Ton historique est indisponible pour le moment.",
    retry: "Réessayer", table: "Tes résultats enregistrés", date: "Date (UTC)", round: "Manche",
    outcome: "Statut", wpm: "MPM net", accuracy: "Précision", rank: "Rang", result: "Résultats",
    scroll: "Fais défiler le tableau horizontalement pour voir les résultats.",
    outcomes: { finished: "Terminé", timed_out: "Temps écoulé", abandoned: "Abandon" },
  },
  en: {
    title: "Race history", bold: "Ship's", serif: "log",
    intro: "Your completed races, newest first. Dates and times are in UTC.",
    account: "Back to account", open: "View results", first: "Back to recent races",
    older: "Older races", newer: "Newer races", navigation: "History pages",
    empty: "No races on this page.", emptyHelp: "Your results appear here once the race ends, even if you abandoned it.",
    invalid: "This history page is not valid.", unavailable: "Your history is unavailable right now.",
    retry: "Try again", table: "Your saved results", date: "Date (UTC)", round: "Round",
    outcome: "Status", wpm: "Net WPM", accuracy: "Accuracy", rank: "Rank", result: "Results",
    scroll: "Scroll the table horizontally to see the results.",
    outcomes: { finished: "Finished", timed_out: "Time up", abandoned: "Abandoned" },
  },
} as const;

export function getHistoryDictionary(locale: Locale) {
  return history[locale];
}
