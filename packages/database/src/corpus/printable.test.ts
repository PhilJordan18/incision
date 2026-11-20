import { describe, expect, it } from "vitest";
import { printable } from "./printable";

const UNSAFE_LEFT = /[\u0000-\u001f\u007f-\u009f\u2028\u2029\p{Cf}]|\p{Cs}/u;

describe("printable", () => {
  it("escapes every control, separator and format character a file may hold, and parses back to the same value", () => {
    const quoted = [
      "\u001b]8;;x\u0007", // ESC OSC … BEL (C0, escaped by JSON.stringify)
      "\u007f", // DEL
      "\u009b31m", // C1 CSI
      "\u202eevil\u202c", // bidi override
      "\u2066\u2069\u200f\u061c\u00ad\ufeff", // isolates, marks, soft hyphen, BOM
      String.fromCodePoint(0xe0001, 0xe0041), // TAG characters, outside the BMP
      "\u2028\u2029", // line and paragraph separators
      "\ud800", // lone surrogate
    ].join("|");
    const line = printable({ detail: quoted });
    expect(line).not.toMatch(UNSAFE_LEFT);
    expect(line).toContain("\\udb40\\udc01\\udb40\\udc41");
    expect(JSON.parse(line)).toEqual({ detail: quoted });
  });

  it("leaves letters, accents and ordinary punctuation as they are", () => {
    expect(printable({ id: "fr-verne", detail: "Océan « pacifique » ; l'île" })).toBe('{"id":"fr-verne","detail":"Océan « pacifique » ; l\'île"}');
  });
});
