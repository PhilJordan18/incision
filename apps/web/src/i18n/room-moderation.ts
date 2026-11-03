import type { Locale } from "./locale";

const fr = {
  expelled: "Expulsion de la salle", explanation: "L’hôte t’a expulsé de cette salle. Cette identité ne peut plus la rejoindre. Tu peux rejoindre une autre salle.",
  title: "Modération de la salle", expel: "Expulser", cancel: "Annuler", confirm: "Confirmer l’expulsion",
  warning: "Cette personne sera déconnectée et son identité ne pourra plus rejoindre cette salle, même avec une invitation.",
  saved: "Expulsion enregistrée.", reload: "Actualiser la salle", disconnected: "Reconnecte-toi pour gérer la salle.",
  errors: {
    NOT_HOST: "Seul l’hôte actuel peut expulser une personne.", NOT_IN_A_ROOM: "Tu ne fais plus partie de cette salle.",
    ROOM_CLOSED: "La salle est fermée.", INVALID_TARGET: "Cette personne n’est plus présente dans cette salle.",
    CANNOT_EXPEL_SELF: "Tu ne peux pas t’expulser toi-même.", STALE_REVISION: "La salle a changé. Actualise-la avant de confirmer.",
    RATE_LIMITED: "Trop de demandes. Patiente avant de réessayer.", UNAVAILABLE: "La demande n’a pas pu être confirmée. Actualise la salle.",
  },
};
const en: typeof fr = {
  expelled: "Expelled from the room", explanation: "The host expelled you from this room. This identity can no longer join it. You can join another room.",
  title: "Room moderation", expel: "Expel", cancel: "Cancel", confirm: "Confirm expulsion",
  warning: "This person will be disconnected and their identity will no longer be able to join this room, even with an invitation.",
  saved: "Expulsion saved.", reload: "Refresh the room", disconnected: "Reconnect to manage the room.",
  errors: {
    NOT_HOST: "Only the current host can expel someone.", NOT_IN_A_ROOM: "You are no longer a member of this room.",
    ROOM_CLOSED: "The room is closed.", INVALID_TARGET: "This person is no longer in this room.",
    CANNOT_EXPEL_SELF: "You cannot expel yourself.", STALE_REVISION: "The room changed. Refresh it before confirming.",
    RATE_LIMITED: "Too many requests. Wait before trying again.", UNAVAILABLE: "The request could not be confirmed. Refresh the room.",
  },
};
export function roomModerationCopy(locale: Locale) { return locale === "fr" ? fr : en; }
