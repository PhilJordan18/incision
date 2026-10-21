import path from "node:path";
import pg from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { type CheckedCorpus, checkCorpus } from "../src/corpus/check";
import { readCorpusVersion } from "../src/corpus/files";
import type { CorpusFile } from "../src/corpus/format";
import { importCorpus } from "../src/corpus/import";
import { loadActiveCorpus } from "../src/corpus/load";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

const FIXTURE_FOLDER = path.join(import.meta.dirname, "fixtures", "corpus-contract");
const FIXTURE_VERSION = "contract-2026-10-21";
const VERNE = "fr-verne-vingt-mille-lieues-p1-ch14-pacifique";
const STEVENSON = "en-stevenson-treasure-island-ch07-map";

let fixture: { fr: CorpusFile; en: CorpusFile };
let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  fixture = (await readCorpusVersion(FIXTURE_VERSION, FIXTURE_FOLDER)) as { fr: CorpusFile; en: CorpusFile };
});

// The tables are append-only (triggers refuse UPDATE and DELETE): a fresh database per test.
beforeEach(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 6 });
  db = createDatabase(pool);
});

afterEach(async () => {
  await pool.end();
  await database.drop();
});

/** A checked version built from the fixture, with an optional change; the fixture is never edited. */
function corpus(change?: (files: { fr: CorpusFile; en: CorpusFile }) => void): CheckedCorpus {
  const files = structuredClone(fixture);
  change?.(files);
  const check = checkCorpus(files);
  if (!check.ok) {
    throw new Error(`test corpus refused: ${JSON.stringify(check.refusal)}`);
  }
  return check.corpus;
}

const renamed = (version: string) => (files: { fr: CorpusFile; en: CorpusFile }) => {
  files.fr.corpusVersion = version;
  files.en.corpusVersion = version;
};

async function rows<Row extends pg.QueryResultRow>(sql: string): Promise<Row[]> {
  return (await pool.query<Row>(sql)).rows;
}

const snapshot = async () => ({
  versions: await rows("select * from race_corpus_versions order by version"),
  passages: await rows("select * from race_passages order by id"),
  entries: await rows("select * from race_corpus_entries order by version, passage_id"),
});

describe("importCorpus", () => {
  it("imports a version whole and activates it; the active corpus loads frozen and checked", async () => {
    const result = await importCorpus(db, corpus());
    expect(result).toEqual({
      ok: true,
      report: {
        outcome: "imported",
        version: FIXTURE_VERSION,
        active: true,
        retained: { fr: 1, en: 1 },
        spare: { fr: 0, en: 0 },
        compatibleWithDefaults: { fr: 1, en: 1 },
        newPassages: 2,
        keptPassages: 0,
        retiredPassages: 0,
      },
    });
    const stored = await rows<{ id: string; first_version: string; normalization_version: number; source: { url: string } }>(
      "select id, first_version, normalization_version, source from race_passages order by id",
    );
    expect(stored.map((row) => [row.id, row.first_version, row.normalization_version])).toEqual([
      [STEVENSON, FIXTURE_VERSION, 2],
      [VERNE, FIXTURE_VERSION, 2],
    ]);
    expect(stored[1]?.source.url).toBe("https://fr.wikisource.org/w/index.php?oldid=11270647");
    const active = await loadActiveCorpus(db);
    expect(active?.version).toBe(FIXTURE_VERSION);
    expect(active?.passages.map((passage) => passage.id)).toEqual([STEVENSON, VERNE]);
    expect(Object.isFrozen(active?.passages) && active?.passages.every((passage) => Object.isFrozen(passage))).toBe(true);
  });

  it("has no active corpus before the first import", async () => {
    expect(await loadActiveCorpus(db)).toBeUndefined();
  });

  it("is a no-op when the same version comes again with the same content", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const again = await importCorpus(db, corpus());
    expect(again).toMatchObject({ ok: true, report: { outcome: "unchanged", active: true, newPassages: 0, keptPassages: 2 } });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a version already stored with other content, and writes nothing", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const changed = corpus((files) => files.fr.passages.push({ ...files.fr.passages[0]!, id: "fr-verne-copie", status: "spare" }));
    expect(await importCorpus(db, changed)).toEqual({ ok: false, refusal: { code: "VERSION_CONFLICT", detail: `version ${FIXTURE_VERSION} is already stored with other content` } });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a new version that brings a stored passage id with other content, and leaves the previous version active", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const divergent = corpus((files) => {
      renamed("contract-2026-10-22")(files);
      files.fr.passages[0]!.editorial.theme = "un autre thème";
    });
    expect(await importCorpus(db, divergent)).toEqual({
      ok: false,
      refusal: { code: "PASSAGE_CONFLICT", passageId: VERNE, detail: `passage ${VERNE} is already stored with other content` },
    });
    expect(await snapshot()).toEqual(before);
    expect((await loadActiveCorpus(db))?.version).toBe(FIXTURE_VERSION);
  });

  it("retires a passage a newer version leaves out: never drawn again, never deleted or altered", async () => {
    await importCorpus(db, corpus());
    const [verneBefore] = await rows(`select * from race_passages where id = '${VERNE}'`);
    // The next version replaces Verne by another passage that serves the defaults.
    const next = corpus((files) => {
      renamed("contract-2026-10-22")(files);
      files.fr.passages[0] = { ...files.fr.passages[0]!, id: "fr-verne-pacifique-bis" };
    });
    expect(await importCorpus(db, next)).toMatchObject({ ok: true, report: { outcome: "imported", newPassages: 1, keptPassages: 1, retiredPassages: 1 } });
    const active = await loadActiveCorpus(db);
    expect(active?.version).toBe("contract-2026-10-22");
    expect(active?.passages.map((passage) => passage.id)).toEqual([STEVENSON, "fr-verne-pacifique-bis"]);
    expect(await rows(`select * from race_passages where id = '${VERNE}'`)).toEqual([verneBefore]);
    expect(await rows("select version, active from race_corpus_versions order by version")).toEqual([
      { version: FIXTURE_VERSION, active: false },
      { version: "contract-2026-10-22", active: true },
    ]);
    // Importing the older version again changes nothing and does not reactivate it.
    expect(await importCorpus(db, corpus())).toMatchObject({ ok: true, report: { outcome: "unchanged", active: false } });
    expect((await loadActiveCorpus(db))?.version).toBe("contract-2026-10-22");
  });

  it("keeps spares out of the active corpus", async () => {
    const withSpare = corpus((files) => files.en.passages.push({ ...files.en.passages[0]!, id: "en-stevenson-spare", status: "spare" }));
    expect(await importCorpus(db, withSpare)).toMatchObject({ ok: true, report: { spare: { fr: 0, en: 1 }, newPassages: 3 } });
    expect((await loadActiveCorpus(db))?.passages.map((passage) => passage.id)).toEqual([STEVENSON, VERNE]);
  });

  it("writes nothing when a statement fails half-way, and the version active before stays active", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const next = corpus(renamed("contract-2026-10-22"));
    // The checks never let this through; the database refuses it after the version row is written.
    const broken: CheckedCorpus = { ...next, passages: next.passages.map((passage) => ({ ...passage, id: `${passage.id}-bis`, contentHash: "not-a-hash" })) };
    await expect(importCorpus(db, broken)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("serialises two imports of the same version: one imports, the other finds it unchanged", async () => {
    const other = new pg.Pool({ connectionString: database.url, max: 2 });
    try {
      const results = await Promise.all([importCorpus(db, corpus()), importCorpus(createDatabase(other), corpus())]);
      expect(results.map((result) => (result.ok ? result.report.outcome : result.refusal.code)).sort()).toEqual(["imported", "unchanged"]);
      expect(await rows("select count(*)::int as count from race_corpus_versions")).toEqual([{ count: 1 }]);
      expect(await rows("select count(*)::int as count from race_corpus_entries")).toEqual([{ count: 2 }]);
    } finally {
      await other.end();
    }
  });

  it("serialises two imports of different versions: both complete, in order, one active, never a mix", async () => {
    const other = new pg.Pool({ connectionString: database.url, max: 2 });
    try {
      const second = corpus(renamed("contract-2026-10-22"));
      const results = await Promise.all([importCorpus(db, corpus()), importCorpus(createDatabase(other), second)]);
      expect(results.every((result) => result.ok && result.report.outcome === "imported")).toBe(true);
      expect(await rows("select version, count(*)::int as entries from race_corpus_entries group by version order by version")).toEqual([
        { version: FIXTURE_VERSION, entries: 2 },
        { version: "contract-2026-10-22", entries: 2 },
      ]);
      expect(await rows("select count(*)::int as active from race_corpus_versions where active")).toEqual([{ active: 1 }]);
      expect(await rows("select count(*)::int as count from race_passages")).toEqual([{ count: 2 }]);
    } finally {
      await other.end();
    }
  });
});

describe("the corpus tables", () => {
  it("are append-only: content never changes and nothing is deleted; only the active flag moves", async () => {
    await importCorpus(db, corpus());
    const refused = { code: "23001" };
    await expect(pool.query(`update race_passages set text = 'Autre texte.' where id = '${VERNE}'`)).rejects.toMatchObject(refused);
    await expect(pool.query(`delete from race_passages where id = '${VERNE}'`)).rejects.toMatchObject(refused);
    await expect(pool.query(`update race_corpus_versions set checksum = repeat('0', 64)`)).rejects.toMatchObject(refused);
    await expect(pool.query("delete from race_corpus_versions")).rejects.toMatchObject(refused);
    await expect(pool.query("update race_corpus_entries set status = 'spare'")).rejects.toMatchObject(refused);
    await expect(pool.query("delete from race_corpus_entries")).rejects.toMatchObject(refused);
    await pool.query("update race_corpus_versions set active = false");
    expect(await rows("select active from race_corpus_versions")).toEqual([{ active: false }]);
  });

  it("hold at most one active version", async () => {
    await importCorpus(db, corpus());
    await importCorpus(db, corpus(renamed("contract-2026-10-22")));
    await expect(pool.query("update race_corpus_versions set active = true")).rejects.toMatchObject({ code: "23505" });
  });

  it("refuse in the database what the checks refuse: an unknown language, a passage id of the other language", async () => {
    await importCorpus(db, corpus());
    const insert = (id: string, language: string) =>
      pool.query(
        `insert into race_passages (id, language, complexity, text, normalization_version, source_text, adaptations, source, word_count, measures, editorial, checks, content_hash, first_version)
         select $1, $2, complexity, text, normalization_version, source_text, adaptations, source, word_count, measures, editorial, checks, content_hash, first_version
         from race_passages where id = '${VERNE}'`,
        [id, language],
      );
    await expect(insert("de-verne-copie", "de")).rejects.toMatchObject({ code: "23514" });
    await expect(insert("en-verne-copie", "fr")).rejects.toMatchObject({ code: "23514", constraint: "race_passages_id_language" });
  });
});
