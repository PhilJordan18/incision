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
  shown: (shown: number, total: number) => string; live: string; offline: string; unavailable: string; footnote: string;
  quickplay: {
    tag: string; title: string; body: string; submit: string; pending: string;
    noRoom: string; createPublic: string; creating: string; createNote: string; /** `{code}` is replaced: the card is a client component, it takes strings only. */ goToRoom: string;
    errors: { ALREADY_IN_ANOTHER_ROOM: string; RATE_LIMITED: string; UNAVAILABLE: string; CREATE_FAILED: string };
  };
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
  shown: (shown, total) => shown === 0 ? `Aucune salle affichée sur ${total}.` : `${shown} ${shown > 1 ? "salles affichées" : "salle affichée"} sur ${total}.`,
  live: "La liste se met à jour en direct.", offline: "Connexion perdue : la liste n’est plus à jour. Nouvelle tentative…",
  unavailable: "La liste des salles est indisponible pour le moment. Réessaie dans un instant.",
  footnote: "Une salle en course reste visible, mais n’accepte personne avant les résultats.",
  quickplay: {
    tag: "Matchmaking", title: "Une course, tout de suite", submit: "Trouver une salle", pending: "Recherche…",
    body: "Rejoint la salle publique la plus remplie qui a encore une place. S’il n’y en a aucune, tu pourras en créer une.",
    noRoom: "Aucune salle publique n’a de place pour l’instant.", createPublic: "Créer une salle publique", creating: "Création…",
    createNote: "Réglages par défaut : texte en français, 50 mots, complexité moyenne, 30 places. Tu pourras les changer dans la salle.",
    goToRoom: "Retourner à ma salle {code}",
    errors: {
      ALREADY_IN_ANOTHER_ROOM: "Tu es déjà dans une salle. Quitte-la avant d’en chercher une autre.",
      RATE_LIMITED: "Trop de demandes. Attends un peu avant de réessayer.",
      UNAVAILABLE: "La recherche n’a pas pu se faire. Réessaie dans un instant.",
      CREATE_FAILED: "La salle n’a pas pu être créée. Réessaie dans un instant.",
    },
  },
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
  shown: (shown, total) => `Showing ${shown} of ${total} ${total === 1 ? "room" : "rooms"}.`,
  live: "The list updates live.", offline: "Connection lost: the list is out of date. Retrying…",
  unavailable: "The room list is unavailable right now. Try again in a moment.",
  footnote: "A room in a race stays listed but admits no one until its results.",
  quickplay: {
    tag: "Matchmaking", title: "A race, right now", submit: "Find a room", pending: "Searching…",
    body: "Joins the fullest public room that still has a place. If there is none, you can create one.",
    noRoom: "No public room has a free place right now.", createPublic: "Create a public room", creating: "Creating…",
    createNote: "Default settings: English text, 50 words, medium complexity, 30 places. You can change them in the room.",
    goToRoom: "Back to my room {code}",
    errors: {
      ALREADY_IN_ANOTHER_ROOM: "You are already in a room. Leave it before looking for another.",
      RATE_LIMITED: "Too many requests. Wait a little before trying again.",
      UNAVAILABLE: "The search could not run. Try again in a moment.",
      CREATE_FAILED: "The room could not be created. Try again in a moment.",
    },
  },
};

export function publicRoomsCopy(locale: Locale): Copy { return locale === "fr" ? fr : en; }
