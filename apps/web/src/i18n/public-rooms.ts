import type { Complexity, RoomPhase, TextLanguage } from "@incision/domain";
import type { Locale } from "./locale";

type Copy = {
  metaTitle: string; headingBold: string; headingSerif: string; intro: string;
  listTitle: string; openCount: (count: number) => string; filters: string; language: string; complexity: string; all: string;
  apply: string; languages: Record<TextLanguage, string>; complexities: Record<Complexity, string>;
  columns: { room: string; host: string; mode: string; text: string; players: string; state: string };
  arcade: string; training: string; words: (count: number) => string; random: string;
  phases: Record<Exclude<RoomPhase, "closed">, string>;
  join: (code: string) => string; joinShort: string; full: string; notAdmitting: string;
  empty: string; emptyFiltered: string; clearFilters: string; createRoom: string;
  live: string; offline: string; unavailable: string; footnote: string;
};

const fr: Copy = {
  metaTitle: "Salles publiques", headingBold: "Prends la", headingSerif: "mer",
  intro: "Les salles publiques, en direct. Rejoins-en une en attente, ou crée la tienne.",
  listTitle: "Salles publiques", openCount: (count) => `${count} ${count > 1 ? "ouvertes" : "ouverte"}`,
  filters: "Filtres", language: "Langue du texte", complexity: "Complexité", all: "Toutes", apply: "Appliquer les filtres",
  languages: { fr: "Français", en: "Anglais" }, complexities: { easy: "Facile", medium: "Moyenne", hard: "Difficile" },
  columns: { room: "Salle", host: "Hôte", mode: "Mode", text: "Texte", players: "Joueurs", state: "État" },
  arcade: "Arcade", training: "Entraînement", words: (count) => `${count} mots`, random: "mots au hasard",
  phases: { waiting: "En attente", countdown: "Départ", racing: "En course", results: "Résultats" },
  join: (code) => `Rejoindre la salle ${code}`, joinShort: "Rejoindre", full: "Complète", notAdmitting: "Course en cours",
  empty: "Aucune salle publique ouverte pour l’instant.", emptyFiltered: "Aucune salle publique ne correspond à ces filtres.",
  clearFilters: "Voir toutes les salles", createRoom: "Créer une salle",
  live: "La liste se met à jour en direct.", offline: "Connexion perdue : la liste n’est plus à jour. Nouvelle tentative…",
  unavailable: "La liste des salles est indisponible pour le moment. Réessaie dans un instant.",
  footnote: "Une salle en course reste visible, mais n’accepte personne avant les résultats.",
};
const en: Copy = {
  metaTitle: "Public rooms", headingBold: "Set", headingSerif: "sail",
  intro: "Public rooms, live. Join one that is waiting, or create your own.",
  listTitle: "Public rooms", openCount: (count) => `${count} open`,
  filters: "Filters", language: "Text language", complexity: "Complexity", all: "All", apply: "Apply filters",
  languages: { fr: "French", en: "English" }, complexities: { easy: "Easy", medium: "Medium", hard: "Hard" },
  columns: { room: "Room", host: "Host", mode: "Mode", text: "Text", players: "Players", state: "State" },
  arcade: "Arcade", training: "Training", words: (count) => `${count} words`, random: "random words",
  phases: { waiting: "Waiting", countdown: "Starting", racing: "Racing", results: "Results" },
  join: (code) => `Join room ${code}`, joinShort: "Join", full: "Full", notAdmitting: "Race in progress",
  empty: "No public room is open right now.", emptyFiltered: "No public room matches these filters.",
  clearFilters: "Show every room", createRoom: "Create a room",
  live: "The list updates live.", offline: "Connection lost: the list is out of date. Retrying…",
  unavailable: "The room list is unavailable right now. Try again in a moment.",
  footnote: "A room in a race stays listed but admits no one until its results.",
};

export function publicRoomsCopy(locale: Locale): Copy { return locale === "fr" ? fr : en; }
