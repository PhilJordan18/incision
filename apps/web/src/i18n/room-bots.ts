import type { BotLevel } from "@incision/domain";
import type { BotActionError } from "@/server/rooms/bot-actions";
import type { Locale } from "./locale";

const fr = {
  title: "Bots", add: "Ajouter un bot", level: "Niveau du bot", remove: "Retirer", save: "Changer le niveau", empty: "Aucun bot dans cette salle.",
  label: "Bot", reload: "Recharger la salle", pending: "Modification en cours…", waiting: "Enregistré. En attente de la mise à jour de la salle…",
  roster: "Bots dans la salle", addHelp: "Ce choix s’applique uniquement au prochain bot ajouté.",
  savedLevel: "Niveau enregistré :", unsaved: "Modification non enregistrée :", saveHint: "Choisis « Changer le niveau » pour enregistrer.", noChanges: "Aucune modification en attente.",
  added: "Bot ajouté à la salle.", saved: "Niveau du bot enregistré.", removed: "Bot retiré de la salle.",
  disconnected: "Attends la reconnexion avant de modifier les bots.",
  levels: { noob: "Mousse — novice", beginner: "Quartier-maître — débutant", intermediate: "Capitaine — intermédiaire", expert: "Empereur des mers — expert", impossible: "Roi des pirates — impossible" } satisfies Record<BotLevel, string>,
  errors: {
    INVALID_BOT: "Choisis un niveau de bot valide.", NOT_IN_A_ROOM: "Tu ne fais plus partie de cette salle. Recharge-la.",
    NOT_HOST: "Seul l’hôte peut modifier les bots.", ROOM_NOT_WAITING: "Les bots sont verrouillés dès le décompte et jusqu’au retour en salle d’attente.",
    STALE_REVISION: "La salle a changé. Recharge-la avant de réessayer.", ROOM_FULL: "La salle est complète : humains et bots partagent les places.",
    BOT_NOT_FOUND: "Ce bot ne fait plus partie de cette salle. Recharge-la.", RATE_LIMITED: "Trop de modifications. Attends une minute avant de réessayer.",
    UNAVAILABLE: "La confirmation n’a pas été reçue. Recharge la salle pour vérifier avant de réessayer.",
  } satisfies Record<BotActionError, string>,
};
const en: typeof fr = {
  title: "Bots", add: "Add a bot", level: "Bot level", remove: "Remove", save: "Change level", empty: "No bots in this room.",
  label: "Bot", reload: "Reload room", pending: "Saving…", waiting: "Saved. Waiting for the room update…",
  roster: "Bots in the room", addHelp: "This choice applies only to the next bot you add.",
  savedLevel: "Saved level:", unsaved: "Unsaved change:", saveHint: "Choose “Change level” to save.", noChanges: "No unsaved changes.",
  added: "Bot added to the room.", saved: "Bot level saved.", removed: "Bot removed from the room.",
  disconnected: "Wait for reconnection before changing bots.",
  levels: { noob: "Cabin boy — novice", beginner: "Quartermaster — beginner", intermediate: "Captain — intermediate", expert: "Emperor of the seas — expert", impossible: "King of the pirates — impossible" },
  errors: {
    INVALID_BOT: "Choose a valid bot level.", NOT_IN_A_ROOM: "You are no longer in this room. Reload it.",
    NOT_HOST: "Only the host can change bots.", ROOM_NOT_WAITING: "Bots are locked from the countdown until the return to the waiting room.",
    STALE_REVISION: "The room changed. Reload it before trying again.", ROOM_FULL: "The room is full: humans and bots share its places.",
    BOT_NOT_FOUND: "This bot is no longer in this room. Reload it.", RATE_LIMITED: "Too many changes. Wait a minute before trying again.",
    UNAVAILABLE: "Confirmation was not received. Reload the room to check before trying again.",
  },
};
export function roomBotsCopy(locale: Locale) { return locale === "fr" ? fr : en; }
