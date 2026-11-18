import type { Locale } from "./locale";

/**
 * Strings of the long home page (art direction C1 « Cap »): the route map, its four escales and
 * the departure quay. The escales' titles and bodies stay in `journey.ts`; the words below are the
 * new labels and the words drawn inside the decorative scenes.
 */
type HomeRouteCopy = {
  readonly mapLabel: string;
  /** One label per escale, in the order of the guide's steps. */
  readonly stops: readonly [string, string, string, string];
  readonly departureLabel: string;
  readonly quayTitleBold: string;
  readonly quayTitleSerif: string;
  /** Completes the quay field's name for assistive technology, after the visible « Code de salle ». */
  readonly quayCodeContext: string;
  readonly quayJoin: string;
  readonly scenes: {
    readonly heading: string;
    readonly north: string;
    readonly bonusesAtMilestones: string;
    readonly logbook: string;
    readonly record: string;
    readonly curve: string;
    /** The sample sentence of escale 03, cut where the drawing changes style. */
    readonly sample: { readonly typed: string; readonly wrong: string; readonly typedAfter: string; readonly next: string; readonly rest: string };
    readonly keyboardRows: readonly [string, string, string];
    readonly recentKeys: string;
    readonly nextKey: string;
    readonly logKeys: readonly [string, string];
    readonly missedKeys: string;
  };
};

const copy: Record<Locale, HomeRouteCopy> = {
  fr: {
    mapLabel: "Carte de route",
    stops: ["Escale 01", "Escale 02", "Escale 03", "Escale 04"],
    departureLabel: "Départ",
    quayTitleBold: "Prêt à lever",
    quayTitleSerif: "l’ancre ?",
    quayCodeContext: "au quai de départ",
    quayJoin: "Embarquer avec ce code",
    scenes: {
      heading: "Cap",
      north: "N",
      bonusesAtMilestones: "Bonus aux jalons",
      logbook: "Journal de bord",
      record: "Record",
      curve: "Courbe",
      sample: { typed: "La mer était calme ce m", wrong: "e", typedAfter: "tin-là, et pourtant l’éq", next: "u", rest: "ipage savait que la traversée serait longue." },
      keyboardRows: ["azertyuiop", "qsdfghjklm", "wxcvbn"],
      recentKeys: "eql",
      nextKey: "u",
      logKeys: ["azerty", "uio"],
      missedKeys: "péç",
    },
  },
  en: {
    mapLabel: "Route chart",
    stops: ["Port of call 01", "Port of call 02", "Port of call 03", "Port of call 04"],
    departureLabel: "Departure",
    quayTitleBold: "Ready to weigh",
    quayTitleSerif: "anchor?",
    quayCodeContext: "at the departure quay",
    quayJoin: "Board with this code",
    scenes: {
      heading: "Heading",
      north: "N",
      bonusesAtMilestones: "Bonuses at milestones",
      logbook: "Logbook",
      record: "Record",
      curve: "Curve",
      sample: { typed: "The sea was calm that m", wrong: "e", typedAfter: "rning, and yet the cr", next: "e", rest: "w knew the crossing would be long." },
      keyboardRows: ["qwertyuiop", "asdfghjkl", "zxcvbnm"],
      recentKeys: "hcr",
      nextKey: "e",
      logKeys: ["qwerty", "uio"],
      missedKeys: "pzx",
    },
  },
};

export function homeRouteCopy(locale: Locale): HomeRouteCopy {
  return copy[locale];
}
