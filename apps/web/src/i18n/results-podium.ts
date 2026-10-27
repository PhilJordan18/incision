import type { Locale } from "./locale";

const fr = { title: "Podium", explanation: "Les premières places du classement final. Le statut indique qui a terminé le texte." };
const en: typeof fr = { title: "Podium", explanation: "The first places in the final ranking. Each status shows who finished the text." };
export function resultsPodiumLabels(locale: Locale) { return locale === "fr" ? fr : en; }
