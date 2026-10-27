import type { Locale } from "./locale";

export const typingLegendMessages = {
  fr: {
    title: "Repères de frappe",
    mandatory: "Correction obligatoire",
    free: "Frappe libre",
    correct: "Juste : caractère souligné.",
    blocked: "Erreur encadrée : corrige le caractère pour avancer.",
    wrong: "Erreur ondulée : elle reste visible et compte dans la précision.",
    cursor: "Barre verticale : prochain caractère à taper.",
  },
  en: {
    title: "Typing guide",
    mandatory: "Mandatory correction",
    free: "Free typing",
    correct: "Correct: underlined character.",
    blocked: "Boxed error: correct the character to move forward.",
    wrong: "Wavy error: it stays visible and counts towards accuracy.",
    cursor: "Vertical bar: next character to type.",
  },
} satisfies Record<Locale, Record<string, string>>;
