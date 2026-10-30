import type { Locale } from "./locale";
import type { SavedRoomSettings } from "@/components/rooms/room-settings-state";
import type { ConfigureRoomError } from "@/server/rooms/actions";
import type { TextSettingsProblem } from "@/server/rooms/text-settings";

const fr = {
  title: "Réglages de la course", edit: "Modifier les réglages", language: "Langue du texte",
  french: "Français", english: "Anglais", duration: "Durée maximale (secondes)", mode: "Mode de frappe",
  mandatory: "Correction obligatoire", free: "Frappe libre", unlimited: "Aucune limite",
  wordCount: "Nombre de mots", wordCountHint: "De 10 à 200 mots. Le départ sera refusé si aucun passage compatible n’est disponible.",
  modeHint: "Correction obligatoire : corrige chaque erreur pour avancer. Frappe libre : avance malgré les erreurs ; elles comptent dans la précision. Les records restent séparés par mode.",
  save: "Enregistrer les réglages", cancel: "Annuler", saving: "Enregistrement…",
  reload: "Recharger les réglages", saved: "Réglages enregistrés.", waiting: "Enregistré. En attente de la confirmation dans la salle…",
  unavailable: "Réglages indisponibles. Recharge la salle pour les consulter.",
  unsupported: "Ces réglages sont affichés tels qu’enregistrés, mais ne peuvent pas encore être modifiés ici.",
  disconnected: "Attends la reconnexion avant de modifier les réglages.",
  conflict: "Les réglages ont changé dans un autre onglet. Ton brouillon est conservé. Recharge les réglages avant de modifier à nouveau.",
  hint: "Aucune limite, ou de 30 à 600 secondes. Seuls les réglages enregistrés seront utilisés au départ, pas ton brouillon.",
  textKind: "Type de texte", coherent: "Passage cohérent", random: "Mots aléatoires",
  coherentHint: "Un passage du domaine public, coupé au nombre de mots demandé.",
  randomHint: "Des mots tirés au hasard d’une liste relue, sans jurons ni insultes.",
  complexity: "Complexité", easy: "Facile", medium: "Moyenne", hard: "Difficile",
  complexityHint: "Facile : mots courts et courants. Moyenne : jusqu’à 9 lettres. Difficile : mots longs et plus rares.",
  coherentComplexityHint: "Le niveau d’un passage est choisi par la relecture du corpus. Le départ est refusé si aucun passage ne correspond à ces réglages.",
  options: "Options du texte", punctuation: "Ponctuation", numbers: "Chiffres", capitals: "Majuscules", accents: "Accents",
  optionsNone: "aucune",
  include: "Caractères à inclure", exclude: "Caractères à exclure",
  charactersHint: "Tape les caractères à la suite, par exemple « kwz ».",
  charactersDisabled: "Désactivé pour un passage cohérent : on ne réécrit pas un texte d’auteur.",
  none: "aucun",
  textRefusals: {
    WORD_COUNT_OUT_OF_RANGE: "Choisis de 10 à 200 mots.",
    UNSUPPORTED_CHARACTER: "Un caractère n’est pas pris en charge : utilise des lettres de la langue du texte, des chiffres ou de la ponctuation simple.",
    CHARACTER_INCLUDED_AND_EXCLUDED: "Un même caractère est à la fois inclus et exclu (une parenthèse compte avec sa paire).",
    INCLUDED_CHARACTER_DISABLED: "Un caractère inclus dépend d’une option désactivée (chiffres, ponctuation ou accents).",
    OPTION_FULLY_EXCLUDED: "Une option activée n’a plus aucun caractère possible : exclus moins de chiffres ou de signes, ou désactive l’option.",
    NO_COMPATIBLE_WORDS: "Aucun mot de la liste ne respecte ces réglages : exclus moins de caractères ou change de complexité.",
    INCLUDED_CHARACTER_UNAVAILABLE: "Aucun mot disponible ne contient un des caractères à inclure avec ces réglages.",
    INCLUDED_CHARACTERS_DO_NOT_FIT: "Trop de caractères à inclure pour ce nombre de mots : ajoute des mots ou inclus moins de caractères.",
    FORBIDDEN_PAIRS_UNAVOIDABLE: "Ces réglages ne laissent que des mots qui ne peuvent pas se suivre : change de complexité ou de caractères.",
    WORDS_UNAVAILABLE: "Les mots aléatoires ne sont pas encore disponibles sur ce serveur. Choisis un passage cohérent.",
  } satisfies Record<TextSettingsProblem, string>,
  errors: {
    INVALID_SETTINGS: "Choisis une langue, de 10 à 200 mots, un mode de frappe et aucune limite ou une durée entière entre 30 et 600 secondes.",
    TEXT_SETTINGS_REFUSED: "Ces réglages de texte ne peuvent pas produire de texte.",
    RATE_LIMITED: "Trop de modifications. Attends une minute avant de réessayer.",
    NOT_IN_A_ROOM: "Tu ne fais plus partie de cette salle. Recharge la salle.",
    NOT_HOST: "Seul l’hôte peut modifier les réglages. Recharge la salle.",
    ROOM_NOT_WAITING: "La course n’est plus en attente. Les réglages sont verrouillés.",
    STALE_REVISION: "Les réglages ont changé. Recharge-les avant de modifier à nouveau.",
    UNAVAILABLE: "La confirmation n’a pas été reçue. Vérifie les réglages enregistrés en rechargeant avant de réessayer.",
  } satisfies Record<ConfigureRoomError, string>,
};
const en: typeof fr = {
  title: "Race settings", edit: "Edit settings", language: "Text language", french: "French", english: "English",
  duration: "Time limit (seconds)", mode: "Typing mode", mandatory: "Mandatory correction", free: "Free typing", unlimited: "No limit",
  wordCount: "Word count", wordCountHint: "From 10 to 200 words. The race cannot start if no compatible passage is available.",
  modeHint: "Mandatory correction: fix each error to advance. Free typing: advance despite errors; they count towards accuracy. Records stay separate for each mode.",
  save: "Save settings", cancel: "Cancel", saving: "Saving…", reload: "Reload settings", saved: "Settings saved.",
  waiting: "Saved. Waiting for confirmation in the room…", unavailable: "Settings unavailable. Reload the room to view them.",
  unsupported: "These settings are shown as saved, but cannot yet be edited here.",
  disconnected: "Wait for reconnection before editing settings.",
  conflict: "Settings changed in another tab. Your draft is preserved. Reload settings before editing again.",
  hint: "No limit, or from 30 to 600 seconds. Only saved settings will be used at the start, not your draft.",
  textKind: "Text type", coherent: "Coherent passage", random: "Random words",
  coherentHint: "A public-domain passage, cut at the requested word count.",
  randomHint: "Words drawn at random from a reviewed list, without swear words or insults.",
  complexity: "Complexity", easy: "Easy", medium: "Medium", hard: "Hard",
  complexityHint: "Easy: short, common words. Medium: up to 9 letters. Hard: longer, rarer words.",
  coherentComplexityHint: "A passage’s level comes from the corpus review. The race cannot start if no passage fits these settings.",
  options: "Text options", punctuation: "Punctuation", numbers: "Numbers", capitals: "Capitals", accents: "Accents",
  optionsNone: "none",
  include: "Characters to include", exclude: "Characters to exclude",
  charactersHint: "Type the characters one after another, for example “kwz”.",
  charactersDisabled: "Disabled for a coherent passage: an author’s text is never rewritten.",
  none: "none",
  textRefusals: {
    WORD_COUNT_OUT_OF_RANGE: "Choose 10 to 200 words.",
    UNSUPPORTED_CHARACTER: "A character is not supported: use letters of the text’s language, digits or simple punctuation.",
    CHARACTER_INCLUDED_AND_EXCLUDED: "The same character is both included and excluded (a parenthesis counts with its pair).",
    INCLUDED_CHARACTER_DISABLED: "An included character needs an option that is off (numbers, punctuation or accents).",
    OPTION_FULLY_EXCLUDED: "An option that is on has no character left: exclude fewer digits or marks, or turn the option off.",
    NO_COMPATIBLE_WORDS: "No word of the list fits these settings: exclude fewer characters or change the complexity.",
    INCLUDED_CHARACTER_UNAVAILABLE: "No available word holds one of the characters to include with these settings.",
    INCLUDED_CHARACTERS_DO_NOT_FIT: "Too many characters to include for this word count: add words or include fewer characters.",
    FORBIDDEN_PAIRS_UNAVOIDABLE: "These settings leave only words that cannot follow each other: change the complexity or the characters.",
    WORDS_UNAVAILABLE: "Random words are not available on this server yet. Choose a coherent passage.",
  },
  errors: {
    INVALID_SETTINGS: "Choose a language, 10 to 200 words, a typing mode and no limit or a whole duration between 30 and 600 seconds.",
    TEXT_SETTINGS_REFUSED: "These text settings cannot produce a text.",
    RATE_LIMITED: "Too many changes. Wait a minute before trying again.",
    NOT_IN_A_ROOM: "You are no longer in this room. Reload the room.",
    NOT_HOST: "Only the host can edit settings. Reload the room.",
    ROOM_NOT_WAITING: "The race is no longer waiting. Settings are locked.",
    STALE_REVISION: "Settings changed. Reload them before editing again.",
    UNAVAILABLE: "Confirmation was not received. Reload to check the saved settings before trying again.",
  },
};
export function roomSettingsCopy(locale: Locale) { return locale === "fr" ? fr : en; }

export function roomStartNote(settings: SavedRoomSettings | undefined, locale: Locale): string {
  const t = roomSettingsCopy(locale);
  if (settings === undefined) return t.unavailable;
  const duration = settings.timeLimitMs === null ? t.unlimited : `${settings.timeLimitMs / 1000} s`;
  const mode = settings.errorMode === "mandatory" ? t.mandatory : t.free;
  const kind = settings.textKind === "random" ? t.random : t.coherent;
  return locale === "fr" ? `Durée maximale : ${duration}. ${mode}. ${settings.wordCount} mots. ${kind}, complexité ${t[settings.complexity].toLowerCase()}.`
    : `Time limit: ${duration}. ${mode}. ${settings.wordCount} words. ${kind}, ${t[settings.complexity].toLowerCase()} complexity.`;
}
