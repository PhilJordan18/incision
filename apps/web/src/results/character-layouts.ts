/** Printable base characters, not physical key identities. Dead keys are deliberately omitted.
 * Factual reference: xkeyboard-config fr/basic, us/basic, ca/fr and ca/multix. */
export const characterLayouts = {
  "fr-azerty": ["²&é\"'(-è_çà)=", "azertyuiop$", "qsdfghjklmù*", "<wxcvbn,;:!"],
  "us-qwerty": ["`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./"],
  "ca-french": ["#1234567890-=", "qwertyuiop", "asdfghjkl;<", "«zxcvbnm,.é"],
  "ca-multilingual": ["/1234567890-=", "qwertyuiopç", "asdfghjkl;èà", "ùzxcvbnm,.é"],
} as const;
export type CharacterLayout = keyof typeof characterLayouts;
export const CHARACTER_LAYOUTS: readonly CharacterLayout[] = ["fr-azerty", "us-qwerty", "ca-french", "ca-multilingual"];
export function representedCharacters(layout: CharacterLayout): ReadonlySet<string> {
  return new Set([...characterLayouts[layout].join(""), " "]);
}
