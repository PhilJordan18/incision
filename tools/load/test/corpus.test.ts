import { expect, it } from "vitest";
import { LOAD_CORPUS_VERSION, readLoadCorpus } from "../src/corpus";

it("the pinned real corpus passes import checks and serves both default languages", async () => {
  const corpus = await readLoadCorpus();
  expect(corpus.version).toBe(LOAD_CORPUS_VERSION);
  expect(corpus.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(corpus.compatibleWithDefaults.fr).toBeGreaterThan(0);
  expect(corpus.compatibleWithDefaults.en).toBeGreaterThan(0);
  expect(corpus.passages.filter(passage => passage.language === "fr" && passage.status === "retained")).toHaveLength(55);
  expect(corpus.passages.filter(passage => passage.language === "en" && passage.status === "retained")).toHaveLength(56);
});
