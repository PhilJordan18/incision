import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bundleCheckFailures, checkBundle, parseArguments, sentinelLiterals, WORD_LISTS_SENTINEL } from "../src/bundle-check";

const DATA = `// fixture\nexport const FR_WORDS = \`${WORD_LISTS_SENTINEL} words fr v1\n500 maison vrombizouille\`;\n`;
const CLEAN = { "chunks/app.js": "console.log(1)", "css/app.css": "body{}" };

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
    const { client, data } = fixture(CLEAN);
    expect(failures(client, [data], ["vrombizouille"])).toEqual([]);
  });

  it("fails when the sentinel reaches a client asset, however deep", () => {
    const { client, data } = fixture({ ...CLEAN, "chunks/nested/words.js": `const w="${WORD_LISTS_SENTINEL} words fr v1\\n500 maison";` });
    const found = failures(client, [data]);
    expect(found).toHaveLength(1);
    expect(found[0]).toMatch(/sentinel.*words\.js/);
  });

  it("fails on a fingerprint in a client asset even when the sentinel was stripped", () => {
    const { client, data } = fixture({ ...CLEAN, "chunks/words.js": 'const w=["maison","vrombizouille"];' });
    expect(failures(client, [data], ["vrombizouille"])).toEqual([expect.stringMatching(/fingerprint "vrombizouille".*words\.js/)]);
  });

  it("never passes vacuously", () => {
    const { client, data } = fixture(CLEAN, "export const FR_WORDS = `500 maison`;");
    expect(failures(client, [data])).toEqual([expect.stringMatching(/^no sentinel-headed literal in a data file/)]);
    expect(failures(client, [join(client, "..", "absent.ts")])).toEqual([expect.stringMatching(/^data file not found, or not a file/)]);
    expect(failures(client, [client])).toEqual([expect.stringMatching(/^data file not found, or not a file/)]);
    const good = fixture(CLEAN).data;
    expect(failures(fixture({}).client, [good])).toEqual(["no client JavaScript chunk scanned: build the app first, or check the path"]);
    expect(failures(fixture({ "css/a.css": "body{}", "media/a.js": "1" }).client, [good])).toEqual(["no client JavaScript chunk scanned: build the app first, or check the path"]);
    expect(failures(join(client, "..", "no-build"), [good])).toEqual(["client static directory not found: build the app first"]);
    expect(failures(client, [good], ["absentword"])).toEqual(['fingerprint "absentword" is in no data literal, so it proves nothing']);
  });

  it("counts only the sentinel-headed literals, never a comment", () => {
    const commented = `// ${WORD_LISTS_SENTINEL}: the fingerprint is vrombizouille\nexport const FR_WORDS = \`500 maison\`;\n`;
    const { client, data } = fixture(CLEAN, commented);
    expect(failures(client, [data], ["vrombizouille"])).toEqual([
      expect.stringMatching(/^no sentinel-headed literal/),
      'fingerprint "vrombizouille" is in no data literal, so it proves nothing',
    ]);
  });
});

describe("sentinelLiterals", () => {
  it("returns each literal that opens with the sentinel, without its backticks", () => {
    const source = `a \`${WORD_LISTS_SENTINEL} words fr v1\n500 de\`; b \`other\`; c \`${WORD_LISTS_SENTINEL} pairs fr v1\nun deux\`;`;
    expect(sentinelLiterals(source)).toEqual([`${WORD_LISTS_SENTINEL} words fr v1\n500 de`, `${WORD_LISTS_SENTINEL} pairs fr v1\nun deux`]);
  });
});

describe("parseArguments", () => {
  it("reads the client directory, the data files and repeated fingerprints in any order, resolving paths from the base", () => {
    expect(parseArguments(["static", "/abs/fr.ts", "--fingerprint", "a", "../en.ts", "--fingerprint", "b"], "/repo/apps")).toEqual({
      clientStaticDir: "/repo/apps/static",
      dataFiles: ["/abs/fr.ts", "/repo/en.ts"],
      fingerprints: ["a", "b"],
    });
  });

  it.each([[[]], [["static"]], [["static", "fr.ts", "--fingerprint"]], [["static", "fr.ts", "--fingerprint", ""]]])("refuses %j", (args) => {
    expect(parseArguments(args, "/repo")).toBeUndefined();
  });
});
