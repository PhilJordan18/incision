export const bonusJournalLabels = {
  fr: {
    heading: "Journal des bonus",
    help: "Bonus reçus par participant. Les activations sont datées depuis le départ de la course, pauses comprises.",
    none: "Aucun bonus reçu.",
    unavailable: "Journal indisponible : les bonus de cette ancienne course n’ont pas été collectés.",
    milestone: "Jalon {value} %",
    unused: "Non utilisé",
    activated: "Utilisé → {target} · à {seconds} s",
  },
  en: {
    heading: "Bonus journal",
    help: "Bonuses received by each participant. Activation times are measured from the race start, including pauses.",
    none: "No bonuses received.",
    unavailable: "Journal unavailable: bonuses were not collected for this older race.",
    milestone: "Milestone {value}%",
    unused: "Unused",
    activated: "Used → {target} · at {seconds} s",
  },
} as const;
