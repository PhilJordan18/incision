import type { Locale } from "../locale";
import { en } from "./en";
import { type Dictionary, fr } from "./fr";

export type { Dictionary };

const DICTIONARIES: Record<Locale, Dictionary> = { fr, en };

export function getDictionary(locale: Locale): Dictionary {
  return DICTIONARIES[locale];
}
