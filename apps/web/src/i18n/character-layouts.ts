import type { Locale } from "./locale";
import type { CharacterLayout } from "@/results/character-layouts";

const copy = {
  fr: {
    label: "Disposition du repère", reference: "Repère de caractères", others: "Caractères hors du repère",
    help: "Les cases regroupent les caractères attendus, pas les touches physiques. Ce repère montre les caractères de base imprimables : les touches mortes ne sont pas des caractères. Majuscules, caractères composés et autres symboles restent comptés séparément en dessous lorsqu’ils sont hors du repère. Zéro ne signifie pas forcément un caractère pratiqué.",
    temporary: "Choix pour cette vue seulement, sans changer le texte de la course ni tes comptes d’erreurs.",
    noScript: "JavaScript est nécessaire pour changer de repère. Les comptes et le tableau complet restent disponibles.",
    names: { "fr-azerty": "France — AZERTY classique", "us-qwerty": "États-Unis — QWERTY", "ca-french": "Canada — français canadien", "ca-multilingual": "Canada — multilingue standard" } satisfies Record<CharacterLayout, string>,
  },
  en: {
    label: "Reference layout", reference: "Character reference", others: "Characters outside the reference",
    help: "Cells group expected characters, not physical keys. This reference shows printable base characters: dead keys are not characters. Capitals, composed characters and other symbols remain counted separately below when outside the reference. Zero does not necessarily mean a practised character.",
    temporary: "A choice for this view only, without changing the race text or your error counts.",
    noScript: "JavaScript is needed to change the reference. Counts and the full table remain available.",
    names: { "fr-azerty": "France — classic AZERTY", "us-qwerty": "United States — QWERTY", "ca-french": "Canada — Canadian French", "ca-multilingual": "Canada — multilingual standard" } satisfies Record<CharacterLayout, string>,
  },
};
export function characterLayoutCopy(locale: Locale) { return copy[locale]; }
