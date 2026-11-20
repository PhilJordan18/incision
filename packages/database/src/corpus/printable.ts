/** DEL and C1 controls, line and paragraph separators, and invisible format characters (bidi, TAG…). */
const UNSAFE = /[\u007f-\u009f\u2028\u2029\p{Cf}]/gu;

/**
 * A refusal as one line of JSON for an operator's terminal. A refusal can quote a corpus file (an
 * unknown key, an engine message), and those files are another session's input: JSON.stringify
 * escapes C0 controls and lone surrogates, the rest is escaped here, one UTF-16 unit at a time, so
 * that the line parses back to the same value and nothing in it acts on the terminal.
 */
export function printable(value: object): string {
  return JSON.stringify(value).replace(UNSAFE, (match) =>
    Array.from({ length: match.length }, (_, index) => `\\u${match.charCodeAt(index).toString(16).padStart(4, "0")}`).join(""),
  );
}
