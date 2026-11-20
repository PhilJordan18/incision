import { deepStrictEqual } from "node:assert";
import pg from "pg";
import { expect, it } from "vitest";
import { createDatabase } from "../src/client";
import { runMigrations } from "../src/migrations";
import { readCorpusVersion } from "../src/corpus/files";
import { checkCorpus } from "../src/corpus/check";
import { importCorpus } from "../src/corpus/import";
import { loadActiveCorpus } from "../src/corpus/load";
import { createTemporaryDatabase } from "./test-database";

it("retires only the two rejected spare passages without changing history or playable texts", async () => {
  const previous = checkCorpus(await readCorpusVersion("2026-10-25.4"));
  const accepted = checkCorpus(await readCorpusVersion("2026-11-18.1"));
  if (!previous.ok || !accepted.ok) throw new Error("Invalid corpus revision");
  const rejected = new Set(["en-kipling-just-so-cat-opening", "en-twain-life-mississippi-ch09-face-water"]);
  deepStrictEqual(accepted.corpus.passages, previous.corpus.passages.filter((p) => !rejected.has(p.id)));
  expect(accepted.corpus.passages).toHaveLength(120);
  const database = await createTemporaryDatabase();
  const client = new pg.Client({ connectionString: database.url });
  try {
    await runMigrations({ connectionString: database.url });
    await client.connect();
    const db = createDatabase(client);
    expect(await importCorpus(db, previous.corpus)).toMatchObject({ ok: true });
    const history = await client.query("select * from race_passages order by id");
    const playable = await loadActiveCorpus(db);
    expect(await importCorpus(db, accepted.corpus)).toMatchObject({ ok: true, report: {
      outcome: "imported", newPassages: 0, keptPassages: 120, retiredPassages: 0,
      retained: { fr: 55, en: 56 }, spare: { fr: 6, en: 3 },
    } });
    expect((await client.query("select * from race_passages order by id")).rows).toEqual(history.rows);
    expect((await client.query("select passage_id from race_corpus_entries where version=$1 and passage_id=any($2::text[])",
      ["2026-11-18.1", [...rejected]])).rows).toEqual([]);
    const current = await loadActiveCorpus(db);
    expect(current?.version).toBe("2026-11-18.1");
    expect(current?.passages).toEqual(playable?.passages);
    expect(current?.passages).toHaveLength(111);
    expect(await importCorpus(db, accepted.corpus)).toMatchObject({ ok: true, report: { outcome: "unchanged", active: true } });
  } finally { await client.end(); await database.drop(); }
});
