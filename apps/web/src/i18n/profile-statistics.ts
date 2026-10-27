import type { Locale } from "./locale";

const fr = {
  title: "Tes statistiques", scope: "Ton compte seulement · courses terminées, depuis le début.",
  best: "Meilleur MPM net", average: "MPM net moyen", accuracy: "Précision moyenne", races: "Courses", victories: "Victoires",
  rules: "Les délais dépassés et les abandons comptent dans les moyennes. Seule une arrivée peut établir un record. Une victoire exige une arrivée en première place face à au moins un autre humain. Les courses interrompues sont exclues.",
  unavailable: "Tes statistiques sont indisponibles pour le moment. Recharge la page pour réessayer.",
  empty: "Aucune course terminée pour le moment. Tes statistiques apparaîtront après ta première course.",
  missing: "— signifie qu’aucune mesure n’est encore disponible.", progression: "Progression entre les courses",
  window: "Jusqu’aux 30 dernières courses terminées, de la plus ancienne à la plus récente. Un point représente le MPM net final d’une course, pas une mesure pendant la frappe.",
  chart: "MPM net par course, dans l’ordre chronologique. Les valeurs et les dates figurent dans le tableau ci-dessous.",
  table: "Consulter les valeurs de la courbe", date: "Date (UTC)", outcome: "Résultat", wpm: "MPM net", precision: "Précision",
  outcomes: { finished: "Arrivée", timed_out: "Temps écoulé", abandoned: "Abandon" },
};
const en: typeof fr = {
  title: "Your statistics", scope: "Your account only · completed races, all time.",
  best: "Best net WPM", average: "Average net WPM", accuracy: "Average accuracy", races: "Races", victories: "Victories",
  rules: "Timeouts and abandons count towards averages. Only a finish can set a record. A victory requires finishing first against at least one other human. Interrupted races are excluded.",
  unavailable: "Your statistics are unavailable right now. Reload the page to try again.",
  empty: "No completed races yet. Your statistics will appear after your first race.",
  missing: "— means no measurement is available yet.", progression: "Progress across races",
  window: "Up to the latest 30 completed races, oldest to newest. Each point is a race’s final net WPM, not a sample taken during typing.",
  chart: "Net WPM per race in chronological order. Values and dates are listed in the table below.",
  table: "View chart values", date: "Date (UTC)", outcome: "Outcome", wpm: "Net WPM", precision: "Accuracy",
  outcomes: { finished: "Finished", timed_out: "Time up", abandoned: "Abandoned" },
};
export function profileStatisticsLabels(locale: Locale) { return locale === "fr" ? fr : en; }
