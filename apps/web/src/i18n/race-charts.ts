export const raceCharts = {
  fr: {
    speed: "Vitesse pendant la course", speedHelp: "MPM nets cumulés depuis le départ. Les traits relient les observations conservées, sans créer de nouvelles mesures. Chaque courbe s’arrête à la fin de la course de ce participant. Sur petit écran, fais défiler le graphique horizontalement ou consulte le tableau.",
    graph: "Courbes des MPM nets de tous les participants", missing: "Données non recueillies pour cette course.",
    values: "Voir la courbe et les valeurs de chaque participant", runner: "Coureur", time: "Temps écoulé", net: "MPM net", raw: "MPM brut", unit: "MPM", you: "toi",
    heatmap: "Tes caractères manqués", private: "Ces données sont visibles seulement par toi. Chaque mauvaise insertion est comptée, même après correction.",
    keyboard: "Repère AZERTY", keyboardHelp: "Les cases représentent les caractères attendus, pas les touches physiques de ton clavier. Accents et majuscules restent distincts ; les autres caractères figurent en dessous. Zéro signifie aucune erreur enregistrée, pas forcément un caractère pratiqué.",
    count: "Erreurs", character: "Caractère attendu", space: "Espace", others: "Autres caractères", zero: "Aucune erreur enregistrée dans cette course.",
    heatValues: "Voir toutes les erreurs par caractère", low: "Peu d’erreurs", high: "Plus d’erreurs", total: "Total des erreurs", precision: "Les tableaux affichent les mesures conservées, arrondies à six décimales au plus.",
  },
  en: {
    speed: "Speed during the race", speedHelp: "Cumulative net WPM since the start. Lines connect stored observations without creating new measurements. Each curve stops when that participant’s race ends. On small screens, scroll the chart horizontally or use the table.",
    graph: "Net WPM curves for all participants", missing: "Data was not collected for this race.",
    values: "View each participant’s curve and values", runner: "Runner", time: "Elapsed time", net: "Net WPM", raw: "Raw WPM", unit: "WPM", you: "you",
    heatmap: "Your missed characters", private: "Only you can see this data. Every incorrect insertion counts, even after correction.",
    keyboard: "AZERTY reference", keyboardHelp: "Cells represent expected characters, not your physical keyboard keys. Accents and uppercase letters remain distinct; other characters appear below. Zero means no recorded errors, not necessarily a practised character.",
    count: "Errors", character: "Expected character", space: "Space", others: "Other characters", zero: "No errors recorded in this race.",
    heatValues: "View all errors by character", low: "Fewer errors", high: "More errors", total: "Total errors", precision: "Tables show stored measurements, rounded to at most six decimal places.",
  },
} as const;
