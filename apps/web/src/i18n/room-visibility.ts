import type { RoomVisibility } from "@incision/domain";
import type { Locale } from "./locale";
import type { VisibilityActionState } from "@/server/rooms/visibility-actions";

type ErrorCode = NonNullable<VisibilityActionState["error"]>;
type Choice = { readonly label: string; readonly body: string };
type Copy = {
  title: string; legend: string; current: string; edit: string; save: string; cancel: string; reload: string;
  disconnected: string; saved: string; waiting: string; membersStay: string;
  choices: Record<RoomVisibility, Choice>; errors: Record<ErrorCode, string>;
};

/** SALLE-03's three visibilities, in the brief's words (D-15): the design's "Privée · code" is "Sur code". */
const fr: Copy = {
  title: "Visibilité de la salle", legend: "Accès", current: "Visibilité", edit: "Modifier la visibilité",
  save: "Enregistrer la visibilité", cancel: "Annuler", reload: "Actualiser la salle",
  disconnected: "Reconnecte-toi avant de modifier la visibilité.", saved: "Visibilité enregistrée.",
  waiting: "En attente de la mise à jour de la salle…",
  membersStay: "Les personnes déjà dans la salle y restent ; la visibilité décide seulement qui peut entrer ensuite.",
  choices: {
    public: { label: "Publique", body: "Listée avec les salles publiques. On entre directement ou avec le code." },
    code: { label: "Sur code", body: "Absente des listes. On entre avec le code ou un lien d'invitation." },
    private: { label: "Privée", body: "Absente des listes. Lien d'invitation seulement : le code seul ne suffit pas." },
  },
  errors: {
    INVALID_VISIBILITY: "Choisis Publique, Sur code ou Privée.", NOT_IN_A_ROOM: "Tu n'es plus dans cette salle.",
    NOT_HOST: "Seul l'hôte peut modifier la visibilité.", ROOM_NOT_WAITING: "La visibilité se modifie dans la salle d'attente.",
    STALE_REVISION: "La salle a changé. Actualise-la avant de réessayer.", RATE_LIMITED: "Trop de modifications. Patiente avant de réessayer.",
    UNAVAILABLE: "Le résultat n'a pas pu être confirmé. Actualise la salle avant de réessayer.",
  },
};
const en: Copy = {
  title: "Room visibility", legend: "Access", current: "Visibility", edit: "Edit visibility",
  save: "Save visibility", cancel: "Cancel", reload: "Refresh room",
  disconnected: "Reconnect before changing visibility.", saved: "Visibility saved.",
  waiting: "Waiting for the room update…",
  membersStay: "People already in the room stay; visibility only decides who may enter next.",
  choices: {
    public: { label: "Public", body: "Listed with the public rooms. Join directly or with the code." },
    code: { label: "By code", body: "Not listed. Join with the code or an invitation link." },
    private: { label: "Private", body: "Not listed. Invitation link only: the code alone is not enough." },
  },
  errors: {
    INVALID_VISIBILITY: "Choose Public, By code or Private.", NOT_IN_A_ROOM: "You are no longer in this room.",
    NOT_HOST: "Only the host can change visibility.", ROOM_NOT_WAITING: "Visibility can be changed in the waiting room.",
    STALE_REVISION: "The room changed. Refresh it before trying again.", RATE_LIMITED: "Too many changes. Wait before trying again.",
    UNAVAILABLE: "The result could not be confirmed. Refresh the room before trying again.",
  },
};
export function roomVisibilityCopy(locale: Locale): Copy { return locale === "fr" ? fr : en; }
