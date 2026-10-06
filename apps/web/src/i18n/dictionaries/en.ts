import type { Dictionary } from "./fr";

export const en: Dictionary = {
  metadata: {
    description: "Real-time multiplayer typing race.",
  },
  layout: {
    skipToContent: "Skip to content",
    mainNavigation: "Main navigation",
    home: "Home",
    signIn: "Sign in",
    account: "My account",
  },
  home: {
    tagline: "Real-time multiplayer typing race.",
    signInCta: "Sign in",
    accountCta: "Go to my account",
  },
  signIn: {
    title: "Sign in",
    intro: "Sign in with GitHub, Discord or a local account.",
    providersHeading: "With a provider",
    continueWithGitHub: "Continue with GitHub",
    continueWithDiscord: "Continue with Discord",
    redirecting: "Redirecting…",
    localHeading: "With a local account",
    loginLabel: "Username",
    passwordLabel: "Password",
    submit: "Sign in",
    submitting: "Signing in…",
    errors: {
      loginRequired: "Enter your username.",
      loginTooLong: "The username has at most 32 characters.",
      passwordRequired: "Enter your password.",
      passwordTooLong: "The password has at most 128 characters.",
      invalidCredentials: "Incorrect username or password.",
      rateLimited: "Too many attempts. Try again in a few minutes.",
      providerFailed: "Signing in with the provider was cancelled or failed. Try again.",
      unavailable: "Signing in is not possible right now. Try again later.",
    },
  },
  authError: {
    title: "Sign-in failed",
    accessDenied: "Sign-in was refused or cancelled.",
    generic: "Something went wrong while signing in. Try again later.",
    backToSignIn: "Back to sign-in",
  },
  account: {
    title: "My account",
    signedInAs: "Signed in as",
    signOut: "Sign out",
    signingOut: "Signing out…",
    signOutScope: "Signing out ends all your open sessions, on every device.",
    signOutFailed: "Signing out failed. Try again.",
  },
  notFound: {
    title: "Page not found",
    body: "This page does not exist or is no longer available.",
    backHome: "Back to the home page",
  },
  errorBoundary: {
    title: "Something went wrong",
    body: "The page could not be displayed.",
    retry: "Try again",
  },
};
