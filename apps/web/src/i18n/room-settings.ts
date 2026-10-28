import type { Locale } from "./locale";
import type { SavedRoomSettings } from "@/components/rooms/room-settings-state";
import type { ConfigureRoomError } from "@/server/rooms/actions";

const fr = {
  title: "Réglages de la course", edit: "Modifier les réglages", language: "Langue du texte",
  french: "Français", english: "Anglais", duration: "Durée maximale (secondes)", mode: "Mode de frappe",
  mandatory: "Correction obligatoire", free: "Frappe libre", unlimited: "Aucune limite",
  save: "Enregistrer les réglages", cancel: "Annuler", saving: "Enregistrement…",
  reload: "Recharger les réglages", saved: "Réglages enregistrés.", waiting: "Enregistré. En attente de la confirmation dans la salle…",
  unavailable: "Réglages indisponibles. Recharge la salle pour les consulter.",
  unsupported: "Ces réglages sont affichés tels qu’enregistrés, mais ne peuvent pas encore être modifiés ici.",
  disconnected: "Attends la reconnexion avant de modifier les réglages.",
  conflict: "Les réglages ont changé dans un autre onglet. Ton brouillon est conservé. Recharge les réglages avant de modifier à nouveau.",
  hint: "Aucune limite, ou de 30 à 600 secondes. Seuls les réglages enregistrés seront utilisés au départ, pas ton brouillon.",
  errors: {
    INVALID_SETTINGS: "Choisis une langue et aucune limite ou une durée entière entre 30 et 600 secondes.",
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
  save: "Save settings", cancel: "Cancel", saving: "Saving…", reload: "Reload settings", saved: "Settings saved.",
  waiting: "Saved. Waiting for confirmation in the room…", unavailable: "Settings unavailable. Reload the room to view them.",
  unsupported: "These settings are shown as saved, but cannot yet be edited here.",
  disconnected: "Wait for reconnection before editing settings.",
  conflict: "Settings changed in another tab. Your draft is preserved. Reload settings before editing again.",
  hint: "No limit, or from 30 to 600 seconds. Only saved settings will be used at the start, not your draft.",
  errors: {
    INVALID_SETTINGS: "Choose a language and no limit or a whole duration between 30 and 600 seconds.",
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
  return locale === "fr" ? `Durée maximale : ${duration}. ${mode}. Passage du domaine public.`
    : `Time limit: ${duration}. ${mode}. Public-domain passage.`;
}
