import { mkdtempSync, mkdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CorpusFileError, MAX_CORPUS_FILE_BYTES, readCorpusVersion } from "./files";

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

/** A corpus folder holding one version whose files have the given raw contents. */
function corpusFolder(files: { fr: string; en: string }): string {
  const folder = mkdtempSync(path.join(tmpdir(), "incision-corpus-"));
  folders.push(folder);
  mkdirSync(path.join(folder, "v1"));
  writeFileSync(path.join(folder, "v1", "fr.json"), files.fr);
  writeFileSync(path.join(folder, "v1", "en.json"), files.en);
  return folder;
}

const canonical = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

async function refusalOf(folder: string): Promise<CorpusFileError> {
  try {
    await readCorpusVersion("v1", folder);
  } catch (error: unknown) {
    if (error instanceof CorpusFileError) return error;
    throw error;
  }
  throw new Error("read, a refusal was expected");
}

describe("readCorpusVersion", () => {
  it("reads both files of a version written as JSON.stringify(value, null, 2) and a newline", async () => {
    const folder = corpusFolder({ fr: canonical({ language: "fr" }), en: canonical({ language: "en" }) });
    expect(await readCorpusVersion("v1", folder)).toEqual({ fr: { language: "fr" }, en: { language: "en" } });
  });

  it("refuses a duplicate key, which JSON.parse would resolve silently to the last value", async () => {
    const duplicated = '{\n  "licence": "public domain",\n  "licence": "all rights reserved"\n}\n';
    const error = await refusalOf(corpusFolder({ fr: duplicated, en: canonical({}) }));
    expect(error.code).toBe("NOT_CANONICAL_JSON");
    expect(error.file).toMatch(/fr\.json$/);
  });

  it("refuses a file not written in the canonical form, and one that is not JSON", async () => {
    expect((await refusalOf(corpusFolder({ fr: canonical({}), en: '{"a":1}' }))).code).toBe("NOT_CANONICAL_JSON");
    expect((await refusalOf(corpusFolder({ fr: "{", en: canonical({}) }))).code).toBe("INVALID_JSON");
  });

  it("refuses a file larger than a corpus file can be, before reading it", async () => {
    const error = await refusalOf(corpusFolder({ fr: canonical({ text: "a".repeat(MAX_CORPUS_FILE_BYTES) }), en: canonical({}) }));
    expect(error.code).toBe("FILE_TOO_LARGE");
  });

  it("refuses a file that is a link, which could point to a device that never ends", async () => {
    const folder = corpusFolder({ fr: canonical({}), en: canonical({}) });
    const target = path.join(folder, "v1", "fr.json");
    unlinkSync(target);
    symlinkSync("/dev/zero", target);
    expect((await refusalOf(folder)).code).toBe("NOT_A_FILE");
  });

  it("refuses a version name outside the pattern, so it never leaves the corpus folder", async () => {
    await expect(readCorpusVersion("../secrets", corpusFolder({ fr: "{}", en: "{}" }))).rejects.toThrow(/Not a corpus version/);
  });
});
