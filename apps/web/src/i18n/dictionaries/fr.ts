/** French dictionary: the reference shape every other locale must match (I18N-01). */
export const fr = {
  metadata: {
    description: "Course de dactylographie multijoueur en temps réel.",
  },
  layout: {
    skipToContent: "Aller au contenu",
    mainNavigation: "Navigation principale",
    home: "Accueil",
    signIn: "Connexion",
    account: "Mon compte",
  },
  home: {
    title: "Accueil",
    tagline: "Course de dactylographie multijoueur en temps réel.",
    signInCta: "Se connecter",
    accountCta: "Voir mon compte",
  },
  signIn: {
    title: "Connexion",
    intro: "Connectez-vous avec GitHub, Discord ou un compte local.",
    providersLabel: "Fournisseurs de connexion",
    continueWithGitHub: "Continuer avec GitHub",
    continueWithDiscord: "Continuer avec Discord",
    redirecting: "Redirection…",
    separator: "ou",
    localHeading: "Compte local",
    loginLabel: "Identifiant",
    passwordLabel: "Mot de passe",
    submit: "Se connecter",
    submitting: "Connexion…",
    errorSummary: "La connexion a échoué",
    errors: {
      loginRequired: "Saisissez votre identifiant.",
      loginTooLong: "L’identifiant compte au plus 32 caractères.",
      passwordRequired: "Saisissez votre mot de passe.",
      passwordTooLong: "Le mot de passe compte au plus 128 caractères.",
      invalidCredentials: "Identifiant ou mot de passe incorrect.",
      rateLimited: "Trop de tentatives. Réessayez dans quelques minutes.",
      providerFailed: "La connexion avec le fournisseur a été annulée ou a échoué. Réessayez.",
      unavailable: "La connexion est impossible pour le moment. Réessayez plus tard.",
    },
  },
  authError: {
    title: "Connexion impossible",
    accessDenied: "La connexion a été refusée ou annulée.",
    generic: "Une erreur est survenue pendant la connexion. Réessayez plus tard.",
    backToSignIn: "Retour à la connexion",
  },
  account: {
    title: "Mon compte",
    signedInAs: "Connecté en tant que",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
    signOutScope: "La déconnexion ferme toutes vos sessions ouvertes, sur tous vos appareils.",
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
/** Every locale provides exactly the keys of the French dictionary, as strings. */
export type Dictionary = Widen<typeof fr>;
