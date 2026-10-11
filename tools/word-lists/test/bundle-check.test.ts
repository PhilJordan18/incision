import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleCheckFailures, checkBundle, WORD_LISTS_SENTINEL } from "../src/bundle-check";

function fixture(clientAssets: Readonly<Record<string, string>>, dataContent: string): { client: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "bundle-check-"));
  const client = join(root, "static");
  for (const [path, content] of Object.entries(clientAssets)) {
    mkdirSync(join(client, path, ".."), { recursive: true });
    writeFileSync(join(client, path), content);
  }
  mkdirSync(client, { recursive: true });
  const data = join(root, "word-data.ts");
  writeFileSync(data, dataContent);
  return { client, data };
}

describe("the word-list bundle check", () => {
  it("passes when the data stays on the server and the client assets never hold it", () => {
    const { client, data } = fixture({ "chunks/app.js": "console.log(1)", "css/app.css": "body{}" }, `export const marker = "${WORD_LISTS_SENTINEL}";`);
    expect(bundleCheckFailures(checkBundle(client, [data]))).toEqual([]);
  });

  it("fails when the data reaches a client asset, however deep", () => {
    const { client, data } = fixture({ "chunks/app.js": "console.log(1)", "chunks/nested/words.js": `const w = ["${WORD_LISTS_SENTINEL}", "maison"];` }, `export const marker = "${WORD_LISTS_SENTINEL}";`);
    const failures = bundleCheckFailures(checkBundle(client, [data]));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("words.js");
  });

  it("fails when the data file lacks the sentinel, so it can never pass vacuously", () => {
    const { client, data } = fixture({ "chunks/app.js": "console.log(1)" }, "export const words = [];");
    expect(bundleCheckFailures(checkBundle(client, [data]))[0]).toContain("sentinel missing");
  });

  it("fails on an empty build", () => {
    const { client, data } = fixture({}, `export const marker = "${WORD_LISTS_SENTINEL}";`);
    expect(bundleCheckFailures(checkBundle(client, [data]))).toEqual(["no client asset scanned: build the app first"]);
  });
});
