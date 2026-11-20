import { createHash } from "node:crypto";

/**
 * The fingerprints of the corpus (F-02.3a): the same content always gives the same SHA-256, and
 * different content never does. The import computes them from the files; loading the active
 * version computes them again from the rows and refuses a mismatch.
 */

/** JSON with object keys sorted at every level; undefined fields are left out, as JSON has none. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha256 = (value: unknown): string => createHash("sha256").update(canonicalJson(value)).digest("hex");

/**
 * What a passage is, the same in every version (Philippe's decision of October 21): the label,
 * measures, editorial note and check dates are a version's, not the passage's.
 */
export type PassageIdentity = {
  readonly id: string;
  readonly language: string;
  readonly text: string;
  readonly normalizationVersion: number;
  readonly sourceText: string;
  readonly adaptations: readonly string[];
  readonly source: Readonly<Record<string, unknown>>;
  readonly wordCount: number;
};

/** What one version says of a passage. */
export type VersionEntry = {
  readonly identity: PassageIdentity;
  readonly status: string;
  readonly complexity: string;
  readonly measures: unknown;
  readonly editorial: unknown;
  readonly checks: unknown;
};

export function passageContentHash(identity: PassageIdentity): string {
  return sha256(identity);
}

/** The whole version: its header and every entry, in id order. */
export function versionChecksum(version: string, normalizationVersion: number, measuredWith: unknown, entries: readonly VersionEntry[]): string {
  const sorted = [...entries].sort((a, b) => (a.identity.id < b.identity.id ? -1 : a.identity.id > b.identity.id ? 1 : 0));
  return sha256({ version, normalizationVersion, measuredWith, entries: sorted });
}
