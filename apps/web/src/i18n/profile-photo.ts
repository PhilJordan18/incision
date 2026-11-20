import type { Locale } from "./locale";

export type ProfilePhotoLabels = {
  readonly label: string; readonly help: string; readonly scope: string;
  readonly save: string; readonly saving: string; readonly saved: string;
  readonly invalid: string; readonly unavailable: string; readonly busy: string;
  readonly alt: string;
};

const labels: Record<Locale, ProfilePhotoLabels> = {
  fr: {
    label: "Photo de profil",
    help: "JPEG, PNG ou WebP fixe, 2 Mo maximum (2 097 152 octets). Jusqu’à 16 millions de pixels et 8 192 pixels par côté. La photo est recadrée au centre en carré de 256 pixels.",
    scope: "Seule la photo réencodée est conservée, sans ses métadonnées. Elle apparaît ici ; les avatars des salles et des courses ne changent pas encore.",
    save: "Enregistrer la photo", saving: "Enregistrement…", saved: "Photo enregistrée.",
    invalid: "Vérifie le format, la taille et les dimensions de ta photo. Les fichiers animés ou endommagés sont refusés. Ta photo précédente est conservée.",
    unavailable: "Ta photo n’a pas pu être enregistrée. Réessaie ou reconnecte-toi.",
    busy: "Une photo est déjà en cours de traitement. Réessaie dans quelques secondes.",
    alt: "Ta photo de profil",
  },
  en: {
    label: "Profile photo",
    help: "Still JPEG, PNG or WebP, up to 2 MB (2,097,152 bytes). Up to 16 million pixels and 8,192 pixels per side. The photo is centre-cropped to a 256-pixel square.",
    scope: "Only the re-encoded photo is kept, without metadata. It appears here; room and race avatars do not change yet.",
    save: "Save photo", saving: "Saving…", saved: "Photo saved.",
    invalid: "Check your photo’s format, size and dimensions. Animated or damaged files are refused. Your previous photo is kept.",
    unavailable: "Your photo could not be saved. Try again or sign in again.",
    busy: "A photo is already being processed. Try again in a few seconds.",
    alt: "Your profile photo",
  },
};

export function profilePhotoLabels(locale: Locale): ProfilePhotoLabels { return labels[locale]; }
