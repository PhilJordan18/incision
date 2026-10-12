import type { Locale } from "../../i18n/locale";

/** A race text and where it comes from, word for word apart from documented typing adaptations. */
export type RaceText = {
  /** Recorded with each race (its configuration snapshot). */
  readonly id: string;
  readonly text: string;
  readonly source?: {
    readonly work: string;
    readonly url: string;
    readonly licence: string;
    /** What differs from the source, only to make it typable on an FR or EN keyboard. */
    readonly adaptations: string;
  };
};

/**
 * The two fixed texts of the first complete race (F-04.0): short public-domain passages, one per
 * interface language, chosen under D-21 (the sea, sailors, voyages). The text follows the host's
 * interface language at the start (D-19). No line break (Enter is reserved, D-16), and only
 * characters a French or English keyboard types directly.
 */
export const RACE_TEXTS: Readonly<Record<Locale, RaceText>> = {
  fr: {
    id: "fr-verne-vingt-mille-lieues-p1-ch14-pacifique",
    text: "L'Océan pacifique s'étend du nord au sud entre les deux cercles polaires, et de l'ouest à l'est entre l'Asie et l'Amérique sur une étendue de cent quarante-cinq degrés en longitude. C'est la plus tranquille des mers ; ses courants sont larges et lents, ses marées médiocres, ses pluies abondantes. Tel était l'Océan que ma destinée m'appelait d'abord à parcourir dans les plus étranges conditions.",
    source: {
      work: "Jules Verne, Vingt mille lieues sous les mers, 1re partie, chapitre XIV « Le Fleuve noir » (Hetzel, 1870)",
      url: "https://fr.wikisource.org/wiki/Vingt_mille_lieues_sous_les_mers/Partie_1/Chapitre_14 (révision 11270647)",
      licence: "domaine public (Canada, États-Unis); pages Wikisource sous CC BY-SA",
      adaptations: "1 espace insécable remplacée par une espace; 9 apostrophes courbes remplacées par '",
    },
  },
  en: {
    id: "en-stevenson-treasure-island-ch07-map",
    text: "I brooded by the hour together over the map, all the details of which I well remembered. Sitting by the fire in the housekeeper's room, I approached that island in my fancy from every possible direction; I explored every acre of its surface; I climbed a thousand times to that tall hill they call the Spy-glass, and from the top enjoyed the most wonderful and changing prospects.",
    source: {
      work: "Robert Louis Stevenson, Treasure Island, chapter VII “I Go to Bristol”",
      url: "https://www.gutenberg.org/ebooks/120 (Project Gutenberg eBook no. 120, pg120.txt)",
      licence: "public domain (Canada, United States); cited as Project Gutenberg eBook no. 120",
      adaptations: "1 curly apostrophe replaced by '; Gutenberg's hard line breaks joined by a space",
    },
  },
};

/**
 * TEST FIXTURES, short, for the local production builds of the E2E and integration tests
 * (RACE_FIXTURE_TEXTS=allowed). Never validated texts: any other server runs RACE_TEXTS.
 */
export const FIXTURE_RACE_TEXTS: Readonly<Record<Locale, RaceText>> = {
  fr: { id: "fixture", text: "Texte de test : la mer est calme, le vent se lève." },
  en: { id: "fixture", text: "Test text: the sea is calm and the wind rises." },
};
