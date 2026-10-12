import type { Locale } from "../../i18n/locale";

/**
 * TEST FIXTURES, not the race texts of F-04.0. The card asks for two short public-domain
 * passages (FR, EN), with their sources and reuse evidence, that Philippe validates before use;
 * until then only these clearly marked fixtures run, locally: a production build refuses race
 * starts unless RACE_FIXTURE_TEXTS=allowed (server config). The text follows the host's
 * interface language at the start (D-19). No line break (Enter is reserved, D-16), and only
 * characters a French or English keyboard types directly (no typographic apostrophe).
 */
export const FIXTURE_RACE_TEXTS: Readonly<Record<Locale, string>> = {
  fr: "Texte de test : la mer est calme, le vent se lève.",
  en: "Test text: the sea is calm and the wind rises.",
};
