import type { Locale } from "../locale";

export const raceTrackMessages = {
  fr: { finish: "Arrivée", all: "Voir tous les coureurs", others: "autres coureurs", bot: "Bot", progression: "Position selon la progression, pas le classement final.", empty: "En attente de la progression…" },
  en: { finish: "Finish", all: "View all runners", others: "other runners", bot: "Bot", progression: "Position shows progress, not the final ranking.", empty: "Waiting for progress…" },
} satisfies Record<Locale, { finish: string; all: string; others: string; bot: string; progression: string; empty: string }>;
