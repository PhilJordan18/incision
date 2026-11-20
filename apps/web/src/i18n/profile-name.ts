import type { Locale } from "./locale";

export type ProfileNameLabels = {
  readonly label: string; readonly help: string; readonly scope: string;
  readonly save: string; readonly saving: string; readonly saved: string;
  readonly invalid: string; readonly unavailable: string;
};

const labels: Record<Locale, ProfileNameLabels> = {
  fr: {
    label: "Nom d’affichage",
    help: "De 1 à 40 caractères après normalisation des lettres et des espaces. Les caractères invisibles sont refusés.",
    scope: "Ton identifiant de connexion ne change pas. Le nouveau nom apparaît à ta prochaine entrée dans une salle ; les noms déjà affichés dans une salle et tes anciens résultats restent inchangés.",
    save: "Enregistrer le nom", saving: "Enregistrement…", saved: "Nom enregistré.",
    invalid: "Vérifie ton nom : de 1 à 40 caractères visibles après normalisation.",
    unavailable: "Ton nom n’a pas pu être enregistré. Réessaie ou reconnecte-toi.",
  },
  en: {
    label: "Display name",
    help: "1–40 characters after letter and whitespace normalization. Invisible characters are not allowed.",
    scope: "Your sign-in username stays the same. The new name appears when you next join a room; existing room names and past results stay unchanged.",
    save: "Save display name", saving: "Saving…", saved: "Name saved.",
    invalid: "Check your name: 1–40 visible characters after normalization.",
    unavailable: "Your name could not be saved. Try again or sign in again.",
  },
};

export function profileNameLabels(locale: Locale): ProfileNameLabels { return labels[locale]; }
