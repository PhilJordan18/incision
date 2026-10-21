/**
 * TEST FIXTURES ONLY, never exported from index.ts: hand-written word lists and synthetic passages
 * for the F-02.5 tests. The Zipf values are invented to fill each complexity band; nothing here is
 * wordfreq data, a corpus passage or a validated text.
 */
import type { ExclusionList, ForbiddenPairList, TextLanguage, WordList } from "../words/types";
import type { Passage } from "./coherent";
import { normalizePassage } from "./normalize";

const list = (language: TextLanguage, words: readonly (readonly [string, number])[]): WordList => ({
  language,
  version: "test-fixture-1",
  entries: [...words].sort((a, b) => b[1] - a[1]).map(([word, zipf]) => ({ word, zipf })),
});

export const FR_TEST_LIST = list("fr", [
  // easy band: at most 5 letters, Zipf 4 or more
  ["de", 7.3], ["la", 7.2], ["le", 7.1], ["et", 7], ["un", 6.9], ["une", 6.8], ["est", 6.7], ["pas", 6.5], ["pour", 6.4], ["que", 6.3],
  ["dans", 6.2], ["sur", 6.1], ["avec", 6], ["mer", 5.4], ["port", 5], ["vent", 5.1], ["eau", 5.2], ["ciel", 5], ["nuit", 5.3], ["jour", 5.5],
  ["île", 4.6], ["voile", 4.5], ["cap", 4.4], ["phare", 4.2], ["sable", 4.3], ["vague", 4.4], ["ancre", 4.1], ["quai", 4.2], ["nord", 4.8], ["sud", 4.7],
  ["côte", 4.6], ["rêve", 4.5], ["été", 5], ["fête", 4.6], ["mât", 4], ["zéro", 4.3], ["bleu", 4.9], ["gris", 4.5], ["vieux", 5], ["loin", 5.1],
  ["aujourd'hui", 5.6], ["cœur", 5.3], ["sœur", 4.9], ["motinterdit", 4.2],
  // medium band: at most 9 letters, Zipf 3.3 or more
  ["bateau", 3.9], ["marin", 3.8], ["navire", 3.7], ["matelot", 3.5], ["horizon", 3.9], ["tempête", 3.8], ["boussole", 3.4], ["capitaine", 3.9],
  ["équipage", 3.6], ["voilier", 3.5], ["pirate", 3.7], ["trésor", 3.9], ["carte", 3.95], ["rivage", 3.5], ["falaise", 3.4], ["corsaire", 3.3],
  ["kayak", 3.4], ["whisky", 3.3], ["yacht", 3.5], ["jetée", 3.4], ["axe", 3.9],
  // hard band: at most 16 letters, Zipf 2.5 or more
  ["hydrographie", 2.6], ["cartographie", 2.9], ["navigation", 3.2], ["astrolabe", 2.7], ["gouvernail", 3], ["bastingage", 2.8], ["scaphandre", 2.9],
  ["ichtyologiste", 2.5], ["phosphorescent", 2.7], ["longitude", 3.1], ["latitude", 3.1], ["archipel", 3.2],
]);

export const EN_TEST_LIST = list("en", [
  ["the", 7.7], ["and", 7.4], ["of", 7.3], ["to", 7.3], ["a", 7.2], ["in", 7.1], ["is", 6.9], ["it", 6.9], ["was", 6.8], ["for", 6.7],
  ["sea", 5.2], ["ship", 5], ["wind", 5], ["sail", 4.6], ["port", 4.8], ["map", 5], ["isle", 4.1], ["star", 5.1], ["moon", 5], ["sun", 5.2],
  ["wave", 4.9], ["quay", 4], ["jib", 4], ["box", 5], ["zest", 4], ["kite", 4.2], ["yard", 4.8], ["deck", 4.6], ["mast", 4.1], ["tide", 4.4],
  ["bad", 5.3], ["word", 5.4],
  ["harbour", 3.8], ["captain", 3.9], ["sailor", 3.7], ["compass", 3.6], ["treasure", 3.9], ["island", 3.95], ["anchor", 3.7], ["voyage", 3.6],
  ["horizon", 3.6], ["lantern", 3.4], ["schooner", 3.3], ["quarrel", 3.4], ["jovial", 3.3], ["oxygen", 3.5],
  ["navigation", 3.2], ["cartography", 2.8], ["hydrography", 2.6], ["astrolabe", 2.6], ["buccaneer", 2.9], ["boatswain", 2.8], ["figurehead", 2.7],
  ["phosphorescent", 2.6], ["longitude", 3.1], ["latitude", 3.1], ["archipelago", 3],
]);

export const FR_TEST_EXCLUSIONS: ExclusionList = { language: "fr", version: "test-fixture-1", words: ["motinterdit"] };
export const EN_TEST_EXCLUSIONS: ExclusionList = { language: "en", version: "test-fixture-1", words: ["bad"] };

/** Neutral pairs: the mechanism is what these tests prove, not the content of the real list (P-2). */
export const FR_TEST_PAIRS: ForbiddenPairList = { language: "fr", version: "test-fixture-1", pairs: [["mer", "port"], ["vent", "voile"]] };
export const EN_TEST_PAIRS: ForbiddenPairList = { language: "en", version: "test-fixture-1", pairs: [["sea", "ship"], ["word", "map"]] };

/** Synthetic passages built from invented sentences, long enough for 200 words. */
function passage(id: string, language: TextLanguage, complexity: Passage["complexity"], sentences: readonly string[], repeat: number): Passage {
  const source = Array.from({ length: repeat }, (_, round) => sentences.map((sentence) => sentence.replace("#", String(round + 1)))).flat().join(" ");
  const normalised = normalizePassage(source, language);
  if (!normalised.ok) throw new RangeError(`Fixture ${id} does not normalise: ${normalised.reason}`);
  return { id, language, complexity, text: normalised.text };
}

export const TEST_PASSAGES: readonly Passage[] = [
  passage("fr-test-easy", "fr", "easy", ["Le vent souffle sur la mer bleue.", "Un marin chante au port ; il rit !", "Le jour # est beau, et l'eau est calme."], 12),
  passage("fr-test-medium", "fr", "medium", ["Le capitaine regarde l'horizon depuis la jetée.", "Où est la carte du trésor ?", "L'équipage prépare le voilier numéro # pour la course-poursuite."], 10),
  passage("fr-test-hard", "fr", "hard", ["L'ichtyologiste consigne ses observations : longitude, latitude, profondeur.", "« Navigation de nuit », écrit-il — sans hésiter.", "Le scaphandre numéro # résiste à la pression."], 10),
  passage("en-test-easy", "en", "easy", ["The wind blows on the blue sea.", "A sailor sings at the port; he laughs!", "Day # is fine, and the water is calm."], 12),
  passage("en-test-medium", "en", "medium", ["The captain watches the horizon from the quay.", "Where is the treasure map?", "The crew prepares schooner number # for the long-awaited race."], 10),
  passage("en-test-hard", "en", "hard", ["The hydrographer records his observations: longitude, latitude, depth.", "“Night navigation,” he writes—without hesitation.", "Diving suit # withstands the pressure."], 11),
];
