/**
 * French dictionary: the reference shape every other locale must match (I18N-01).
 * Tone (apps/design/README.md §5): tutoiement, short sentences; a light sea vocabulary
 * in titles and states, never in button labels (verb + object).
 */
export const fr = {
  metadata: {
    description: "Une course de frappe en temps réel pour toute la classe.",
  },
  layout: {
    skipToContent: "Aller au contenu",
    mainNavigation: "Navigation principale",
    homeLink: "Incision, accueil",
    signIn: "Se connecter",
    account: "Mon compte",
    languageLabel: "Langue de l’interface",
    languageNames: { fr: "Français", en: "English" },
    themeToAube: "Passer au thème clair Aube",
    themeToAbysse: "Passer au thème sombre Abysse",
    footer: "Incision · un projet de Philippe Monfouayi",
  },
  home: {
    titleLine1: "Tape.",
    titleLine2: "Dépasse.",
    titleSerif: "arrive.",
    description:
      "Une course de frappe en temps réel pour toute la classe. Même texte pour tous, ta position en direct, tes progrès d’une fois à l’autre.",
    codeLabel: "Code de salle",
    codePlaceholder: "B7K4PQ",
    join: "Rejoindre la salle",
    joining: "Recherche…",
    codeErrors: {
      EMPTY: "Saisis le code de la salle.",
      WRONG_LENGTH: "Un code compte 6 caractères.",
      INVALID_CHARACTER: "Le code n’utilise que des lettres et des chiffres, sans 0, O, 1, I ni L.",
    },
    visibilityHeading: "Trois façons d’ouvrir une salle",
    visibilities: {
      public: { title: "Salle publique", body: "Visible dans la liste, ouverte à tous." },
      code: { title: "Sur code", body: "Cachée de la liste : on entre avec son code de 6 caractères." },
      private: { title: "Privée", body: "Sur invitation seulement : un lien personnel, le code seul ne suffit pas." },
    },
  },
  signIn: {
    title: "Connexion",
    headingBold: "Bon",
    headingSerif: "retour",
    tagline: "Toutes les routes mènent à l’arrivée.",
    providersLabel: "Se connecter avec un fournisseur",
    continueWithGitHub: "GitHub",
    continueWithDiscord: "Discord",
    gitHubAriaLabel: "Se connecter avec GitHub",
    discordAriaLabel: "Se connecter avec Discord",
    redirecting: "Redirection…",
    separator: "Ou avec un nom d’utilisateur",
    loginLabel: "Nom d’utilisateur",
    passwordLabel: "Mot de passe",
    showPassword: "Afficher le mot de passe",
    submit: "Se connecter",
    submitting: "Connexion…",
    privacyNote:
      "Aucun courriel n’est demandé ni conservé. Mot de passe oublié : demande à ton enseignant de recréer ton compte.",
    errors: {
      loginRequired: "Saisis ton nom d’utilisateur.",
      loginTooLong: "Le nom d’utilisateur compte au plus 32 caractères.",
      passwordRequired: "Saisis ton mot de passe.",
      passwordTooLong: "Le mot de passe compte au plus 128 caractères.",
      invalidCredentials: "Nom d’utilisateur ou mot de passe incorrect.",
      rateLimited: "Trop de tentatives. Réessaie dans quelques minutes.",
      providerFailed: "La connexion avec le fournisseur a été annulée ou a échoué. Réessaie.",
      unavailable: "La connexion est impossible pour le moment. Réessaie plus tard.",
    },
  },
  authError: {
    title: "Connexion impossible",
    label: "Erreur d’authentification",
    headingBold: "Connexion",
    headingSerif: "impossible",
    accessDenied: "La connexion a été refusée ou annulée. Tu peux réessayer avec un autre moyen.",
    generic: "Une erreur est survenue pendant la connexion. Réessaie dans un moment.",
    backToSignIn: "Revenir à la connexion",
  },
  account: {
    title: "Mon compte",
    headingBold: "Mon",
    headingSerif: "compte",
    displayNameLabel: "Pseudo",
    signOut: "Se déconnecter",
    signingOut: "Déconnexion…",
    signOutScope: "Te déconnecter ferme toutes tes sessions, sur tous tes appareils.",
    signOutFailed: "La déconnexion a échoué. Réessaie.",
  },
  notFound: {
    title: "Page introuvable",
    label: "Erreur 404",
    headingBold: "Cap",
    headingSerif: "perdu",
    body: "Cette page n’existe pas ou n’est plus disponible.",
    backHome: "Revenir à l’accueil",
  },
  globalError: {
    title: "Avarie",
    body: "Le site n’a pas pu s’afficher. Réessaie dans un moment.",
    retry: "Réessayer",
  },
  errorBoundary: {
    label: "Erreur",
    title: "Avarie",
    body: "La page n’a pas pu s’afficher. Réessaie ; si ça continue, reviens plus tard.",
    retry: "Réessayer",
    backHome: "Revenir à l’accueil",
  },
} as const;

type Widen<T> = { readonly [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
/** Every locale provides exactly the keys of the French dictionary, as strings. */
export type Dictionary = Widen<typeof fr>;
