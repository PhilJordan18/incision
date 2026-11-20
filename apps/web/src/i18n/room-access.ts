import type { Locale } from "./locale";
import type { CapacityActionState } from "@/server/rooms/capacity-actions";

type ErrorCode = NonNullable<CapacityActionState["error"]>;
type Copy = { title: string; capacity: string; hint: string; edit: string; save: string; cancel: string; reload: string;
  disconnected: string; saved: string; waiting: string; errors: Record<ErrorCode, string> };
const fr: Copy = {
  title: "Capacité de la salle", capacity: "Nombre maximal de participants",
  hint: "De 2 à 30 participants, bots compris. Les spectateurs ne prennent pas de place de participant (20 maximum).",
  edit: "Modifier la capacité", save: "Enregistrer la capacité", cancel: "Annuler", reload: "Actualiser la salle",
  disconnected: "Reconnecte-toi avant de modifier la capacité.", saved: "Capacité enregistrée.", waiting: "En attente de la mise à jour de la salle…",
  errors: {
    INVALID_CAPACITY: "Choisis un nombre entier de 2 à 30.", CAPACITY_BELOW_OCCUPANCY: "La capacité ne peut pas être inférieure au nombre de participants et de bots présents.",
    NOT_IN_A_ROOM: "Tu n'es plus dans cette salle.", NOT_HOST: "Seul l'hôte peut modifier la capacité.",
    ROOM_NOT_WAITING: "La capacité se modifie dans la salle d'attente.", STALE_REVISION: "La salle a changé. Actualise-la avant de réessayer.",
    RATE_LIMITED: "Trop de modifications. Patiente avant de réessayer.", UNAVAILABLE: "Le résultat n'a pas pu être confirmé. Actualise la salle avant de réessayer.",
  },
};
const en: Copy = {
  title: "Room capacity", capacity: "Maximum participants",
  hint: "From 2 to 30 participants, including bots. Spectators do not take participant places (20 maximum).",
  edit: "Edit capacity", save: "Save capacity", cancel: "Cancel", reload: "Refresh room",
  disconnected: "Reconnect before changing capacity.", saved: "Capacity saved.", waiting: "Waiting for the room update…",
  errors: {
    INVALID_CAPACITY: "Choose a whole number from 2 to 30.", CAPACITY_BELOW_OCCUPANCY: "Capacity cannot be lower than the number of participants and bots present.",
    NOT_IN_A_ROOM: "You are no longer in this room.", NOT_HOST: "Only the host can change capacity.",
    ROOM_NOT_WAITING: "Capacity can be changed in the waiting room.", STALE_REVISION: "The room changed. Refresh it before trying again.",
    RATE_LIMITED: "Too many changes. Wait before trying again.", UNAVAILABLE: "The result could not be confirmed. Refresh the room before trying again.",
  },
};
export function roomAccessCopy(locale: Locale): Copy { return locale === "fr" ? fr : en; }
