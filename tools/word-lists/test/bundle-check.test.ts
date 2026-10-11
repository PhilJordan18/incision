import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleCheckFailures, checkBundle, parseArguments, WORD_LISTS_SENTINEL } from "../src/bundle-check";

const DATA = `export const FR_WORDS = \`${WORD_LISTS_SENTINEL} words fr v1\n500 maison vrombizouille\`;`;

function fixture(clientAssets: Readonly<Record<string, string>>, dataContent = DATA): { client: string; data: string } {
  const root = mkdtempSync(join(tmpdir(), "bundle-check-"));
  const client = join(root, "static");
  mkdirSync(client, { recursive: true });
  for (const [path, content] of Object.entries(clientAssets)) {
    mkdirSync(join(client, path, ".."), { recursive: true });
    writeFileSync(join(client, path), content);
  }
  const data = join(root, "fr.ts");
  writeFileSync(data, dataContent);
  return { client, data };
}

const failures = (client: string, data: readonly string[], fingerprints: readonly string[] = []): readonly string[] =>
  bundleCheckFailures(checkBundle(client, data, { fingerprints }));

describe("the word-data bundle check", () => {
  it("passes when the data stay on the server", () => {
    const { client, data } = fixture({ "chunks/app.js": "console.log(1)", "css/app.css": "body{}" });
    expect(failures(client, [data], ["vrombizouille"])).toEqual([]);
  });

  it("fails when the sentinel reaches a client asset, however deep", () => {
    const { client, data } = fixture({ "chunks/app.js": "console.log(1)", "chunks/nested/words.js": `const w="${WORD_LISTS_SENTINEL} words fr v1\\n500 maison";` });
    const found = failures(client, [data]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/sentinel.*words\.js/);
  });

  it("fails on a fingerprint in a client asset even when the sentinel was stripped", () => {
    const { client, data } = fixture({ "chunks/words.js": 'const w=["maison","vrombizouille"];' });
    expect(failures(client, [data], ["vrombizouille"])).toEqual([expect.stringMatching(/fingerprint "vrombizouille".*words\.js/)]);
  });

  it("never passes vacuously", () => {
    const { client, data } = fixture({ "chunks/app.js": "console.log(1)" }, "export const FR_WORDS = `500 maison`;");
    expect(failures(client, [data])).toEqual([expect.stringMatching(/^sentinel missing from a data file/)]);
    expect(failures(client, [join(client, "..", "absent.ts")])).toEqual([expect.stringMatching(/^data file not found/)]);
    expect(failures(fixture({}).client, [data])).toContain("no client asset scanned: build the app first");
    expect(failures(join(client, "..", "no-build"), [fixture({}).data])).toEqual(["client static directory not found: build the app first"]);
    expect(failures(fixture({ "a.js": "1" }).client, [fixture({}).data], ["absentword"])).toEqual(['fingerprint "absentword" is in no data file, so it proves nothing']);
  });
});

describe("parseArguments", () => {
  it("reads the client directory, the data files and repeated fingerprints in any order", () => {
    expect(parseArguments(["static", "fr.ts", "--fingerprint", "a", "en.ts", "--fingerprint", "b"])).toEqual({ clientStaticDir: "static", dataFiles: ["fr.ts", "en.ts"], fingerprints: ["a", "b"] });
  });

  it.each([[[]], [["static"]], [["static", "fr.ts", "--fingerprint"]], [["static", "fr.ts", "--fingerprint", ""]]])("refuses %j", (args) => {
    expect(parseArguments(args)).toBeUndefined();
  });
});
