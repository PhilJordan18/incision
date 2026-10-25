import type { Locale } from "../locale";

/** Dedicated FR/EN namespace; keeps the independently owned race/corpus dictionaries intact. */
export const physicalKeyboardMessages = {
  fr: {
    heading: "Un clavier physique pour courir",
    description: "Sur téléphone, suis la course sur la piste. Pour taper, utilise un ordinateur ou une tablette avec un clavier physique.",
  },
  en: {
    heading: "A physical keyboard to race",
    description: "On a phone, follow the race on the track. To type, use a computer or tablet with a physical keyboard.",
  },
} satisfies Record<Locale, { readonly heading: string; readonly description: string }>;
