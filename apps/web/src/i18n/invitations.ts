import type { Locale } from "./locale";
const fr = {
  title: "Invitations", intro: "Chaque lien est lié à la première personne admise et à son adresse IP. Il ne peut pas être partagé ensuite.",
  generate: "Générer une invitation", once: "Copie ce lien maintenant : il ne sera plus affiché après avoir quitté cette page.",
  link: "Lien d’invitation", copy: "Copier le lien", copied: "Lien copié.", copyFailed: "Sélectionne le lien et copie-le manuellement.",
  refresh: "Afficher / actualiser les invitations", unused: "Non utilisée", used: "Utilisée par", revoked: "Révoquée", revoke: "Révoquer", empty: "Aucune invitation.",
  previous: "Page précédente", next: "Page suivante", pending: "En cours…", unavailable: "Action impossible. Actualise la page et réessaie.",
  invalid: "Invitation indisponible. Demande un nouveau lien à l’hôte si nécessaire.", limited: "Trop de tentatives. Attends une minute avant de réessayer.",
  join: "Rejoindre par invitation", signIn: "Se connecter avec un compte", reopen: "Après la connexion, rouvre le lien d’invitation original. Son secret n’est pas transmis à la page de connexion.",
  javascript: "JavaScript est nécessaire pour utiliser ce lien sans envoyer son secret dans l’URL du serveur.",
  missing: "Ouvre le lien complet reçu de l’hôte, y compris la partie après #.", guest: "Entrer comme invité", account: "Rejoindre avec mon compte",
};
const en: typeof fr = {
  title: "Invitations", intro: "Each link is bound to the first person admitted and their IP address. It cannot be shared afterwards.",
  generate: "Generate an invitation", once: "Copy this link now: it will no longer be displayed after you leave this page.",
  link: "Invitation link", copy: "Copy link", copied: "Link copied.", copyFailed: "Select the link and copy it manually.",
  refresh: "Show / refresh invitations", unused: "Unused", used: "Used by", revoked: "Revoked", revoke: "Revoke", empty: "No invitations.",
  previous: "Previous page", next: "Next page", pending: "Working…", unavailable: "Action unavailable. Refresh the page and try again.",
  invalid: "Invitation unavailable. Ask the host for a new link if needed.", limited: "Too many attempts. Wait a minute before trying again.",
  join: "Join by invitation", signIn: "Sign in with an account", reopen: "After signing in, reopen the original invitation link. Its secret is not sent to the sign-in page.",
  javascript: "JavaScript is required to use this link without sending its secret in the server URL.",
  missing: "Open the full link received from the host, including the part after #.", guest: "Enter as a guest", account: "Join with my account",
};
export function invitationCopy(locale: Locale) { return locale === "fr" ? fr : en; }
