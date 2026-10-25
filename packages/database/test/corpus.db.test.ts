import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { type CheckedCorpus, checkCorpus } from "../src/corpus/check";
import { readCorpusVersion } from "../src/corpus/files";
import type { CorpusFile } from "../src/corpus/format";
import { CORPUS_IMPORT_LOCK_KEY, type CorpusImportResult, importCorpus } from "../src/corpus/import";
import { loadActiveCorpus } from "../src/corpus/load";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

const FIXTURE_FOLDER = path.join(import.meta.dirname, "fixtures", "corpus-contract");
const FIXTURE_VERSION = "contract-2026-10-21";
const NEXT_VERSION = "contract-2026-10-22";
const VERNE = "fr-verne-vingt-mille-lieues-p1-ch14-pacifique";
const STEVENSON = "en-stevenson-treasure-island-ch07-map";

type Files = { fr: CorpusFile; en: CorpusFile };
let fixture: Files;
let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  fixture = (await readCorpusVersion(FIXTURE_VERSION, FIXTURE_FOLDER)) as Files;
});

// The tables are append-only (triggers refuse UPDATE, DELETE and TRUNCATE): a fresh database per test.
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
function corpus(change?: (files: Files) => void): CheckedCorpus {
  const files = structuredClone(fixture);
  change?.(files);
  const check = checkCorpus(files);
  if (!check.ok) {
    throw new Error(`test corpus refused: ${JSON.stringify(check.refusal)}`);
  }
  return check.corpus;
}

const renamed = (version: string) => (files: Files) => {
  files.fr.corpusVersion = version;
  files.en.corpusVersion = version;
};

async function rows<Row extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<Row[]> {
  return (await pool.query<Row>(sql, values)).rows;
}

const snapshot = async () => ({
  versions: await rows("select * from race_corpus_versions order by version"),
  passages: await rows("select * from race_passages order by id"),
  entries: await rows("select * from race_corpus_entries order by version, passage_id"),
});

function reportOf(result: CorpusImportResult) {
  if (!result.ok) {
    throw new Error(`refused: ${JSON.stringify(result.refusal)}`);
  }
  return result.report;
}

/** A finished race, naming its passage in its configuration (F-04.0's shape, plus `config`). */
async function storedRace(passageId: string, typed = "Texte.", config: Record<string, unknown> = {}): Promise<void> {
  await pool.query("insert into lobbies (code, capacity) values ('B7K4PQ', 30) on conflict do nothing");
  await pool.query(
    `insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, ended_at, owner_id, lease_expires_at)
     select id, (select count(*) + 1 from races), 'finished', 1, $2, jsonb_build_object('text', $1::text) || $3::jsonb, now() - interval '3 minutes', now() - interval '2 minutes', now() - interval '1 minute', gen_random_uuid(), now()
     from lobbies where code = 'B7K4PQ'`,
    [passageId, typed, JSON.stringify(config)],
  );
}

describe("importCorpus", () => {
  it("imports a version whole and activates it; the active corpus loads frozen, checked, with its labels", async () => {
    expect(reportOf(await importCorpus(db, corpus()))).toEqual({
      outcome: "imported",
      version: FIXTURE_VERSION,
      active: true,
      retained: { fr: 1, en: 1 },
      spare: { fr: 0, en: 0 },
      compatibleWithDefaults: { fr: 1, en: 1 },
      newPassages: 2,
      keptPassages: 0,
      retiredPassages: 0,
    });
    expect(await rows("select id, first_version, normalization_version, source->>'url' as url from race_passages order by id")).toEqual([
      { id: STEVENSON, first_version: FIXTURE_VERSION, normalization_version: 2, url: "https://www.gutenberg.org/ebooks/120" },
      { id: VERNE, first_version: FIXTURE_VERSION, normalization_version: 2, url: "https://fr.wikisource.org/w/index.php?oldid=11270647" },
    ]);
    const active = await loadActiveCorpus(db);
    expect(active?.version).toBe(FIXTURE_VERSION);
    expect(active?.passages.map((passage) => [passage.id, passage.complexity])).toEqual([
      [STEVENSON, "medium"],
      [VERNE, "medium"],
    ]);
    expect(Object.isFrozen(active?.passages)).toBe(true);
    expect(active?.passages.every((passage) => Object.isFrozen(passage))).toBe(true);
  });

  it("has no active corpus before the first import", async () => {
    expect(await loadActiveCorpus(db)).toBeUndefined();
  });

  it("is a no-op when the same version comes again with the same content", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    expect(reportOf(await importCorpus(db, corpus()))).toMatchObject({ outcome: "unchanged", active: true, newPassages: 0, keptPassages: 2 });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a version already stored with other content, and writes nothing", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const changed = corpus((files) => (files.fr.passages[0]!.measures.m4 = 18.5));
    expect(await importCorpus(db, changed)).toEqual({ ok: false, refusal: { code: "VERSION_CONFLICT", detail: `version ${FIXTURE_VERSION} is already stored with other content` } });
    expect(await snapshot()).toEqual(before);
  });

  it("refuses a new version that brings a stored passage id with another text or source, and leaves the previous version active", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const divergent = corpus((files) => {
      renamed(NEXT_VERSION)(files);
      files.fr.passages[0]!.source.edition = "Hetzel, 1871";
    });
    expect(await importCorpus(db, divergent)).toEqual({
      ok: false,
      refusal: { code: "PASSAGE_CONFLICT", passageId: VERNE, detail: `passage ${VERNE} is already stored with another text or source` },
    });
    expect(await snapshot()).toEqual(before);
    expect((await loadActiveCorpus(db))?.version).toBe(FIXTURE_VERSION);
  });

  it("takes a re-measure and a re-check as a new version of the same passages (decision of October 21)", async () => {
    await importCorpus(db, corpus());
    const [verneBefore] = await rows("select * from race_passages where id = $1", [VERNE]);
    const reassessed = corpus((files) => {
      renamed(NEXT_VERSION)(files);
      files.fr.passages[0]!.measures.m4 = 18.5;
      files.fr.passages[0]!.checks.sourceVerifiedAt = "2026-10-22";
      files.en.passages[0]!.editorial.reserves = ["passage à surveiller"];
    });
    expect(reportOf(await importCorpus(db, reassessed))).toMatchObject({ outcome: "imported", newPassages: 0, keptPassages: 2, retiredPassages: 0 });
    expect(await rows("select * from race_passages where id = $1", [VERNE])).toEqual([verneBefore]);
    expect(await rows("select version, measures->>'m4' as m4 from race_corpus_entries where passage_id = $1 order by version", [VERNE])).toEqual([
      { version: FIXTURE_VERSION, m4: "19" },
      { version: NEXT_VERSION, m4: "18.5" },
    ]);
  });

  it("retires a passage a newer version leaves out: never drawn again, never deleted or altered", async () => {
    await importCorpus(db, corpus());
    const [verneBefore] = await rows("select * from race_passages where id = $1", [VERNE]);
    // The next version replaces Verne by another passage that serves the defaults.
    const next = corpus((files) => {
      renamed(NEXT_VERSION)(files);
      files.fr.passages[0] = { ...files.fr.passages[0]!, id: "fr-verne-pacifique-bis" };
    });
    expect(reportOf(await importCorpus(db, next))).toMatchObject({ outcome: "imported", newPassages: 1, keptPassages: 1, retiredPassages: 1 });
    const active = await loadActiveCorpus(db);
    expect(active?.version).toBe(NEXT_VERSION);
    expect(active?.passages.map((passage) => passage.id)).toEqual([STEVENSON, "fr-verne-pacifique-bis"]);
    expect(await rows("select * from race_passages where id = $1", [VERNE])).toEqual([verneBefore]);
    expect(await rows("select version, active from race_corpus_versions order by version")).toEqual([
      { version: FIXTURE_VERSION, active: false },
      { version: NEXT_VERSION, active: true },
    ]);
    // Importing the older version again changes nothing and does not reactivate it.
    expect(reportOf(await importCorpus(db, corpus()))).toMatchObject({ outcome: "unchanged", active: false });
    expect((await loadActiveCorpus(db))?.version).toBe(NEXT_VERSION);
  });

  it("keeps spares out of the active corpus", async () => {
    const withSpare = corpus((files) => files.en.passages.push({ ...files.en.passages[0]!, id: "en-stevenson-spare", status: "spare" }));
    expect(reportOf(await importCorpus(db, withSpare))).toMatchObject({ spare: { fr: 0, en: 1 }, newPassages: 3 });
    expect((await loadActiveCorpus(db))?.passages.map((passage) => passage.id)).toEqual([STEVENSON, VERNE]);
  });

  it("refuses a first version without the two delivery passages, even with no race stored", async () => {
    const withoutVerne = corpus((files) => (files.fr.passages[0] = { ...files.fr.passages[0]!, id: "fr-verne-pacifique-bis" }));
    expect(await importCorpus(db, withoutVerne)).toEqual({
      ok: false,
      refusal: { code: "REQUIRED_PASSAGE_MISSING", passageId: VERNE, detail: `passage ${VERNE} is named by stored races or shipped with F-04.0, and this version does not bring it` },
    });
    expect(await rows("select count(*)::int as count from race_corpus_versions")).toEqual([{ count: 0 }]);
    // Once a version brought it, later versions may leave it out: it stays stored.
    expect(reportOf(await importCorpus(db, corpus())).outcome).toBe("imported");
    const next = corpus((files) => {
      renamed(NEXT_VERSION)(files);
      files.fr.passages[0] = { ...files.fr.passages[0]!, id: "fr-verne-pacifique-bis" };
    });
    expect(reportOf(await importCorpus(db, next)).retiredPassages).toBe(1);
  });

  it("refuses a version that lacks a passage stored races name, and ignores the test texts' marker", async () => {
    await storedRace("fr-autre-passage", fixture.fr.passages[0]!.text);
    await storedRace("fixture");
    expect(await importCorpus(db, corpus())).toMatchObject({ ok: false, refusal: { code: "REQUIRED_PASSAGE_MISSING", passageId: "fr-autre-passage" } });
    const withIt = corpus((files) => files.fr.passages.push({ ...files.fr.passages[0]!, id: "fr-autre-passage", status: "spare" }));
    expect(reportOf(await importCorpus(db, withIt)).outcome).toBe("imported");
  });

  it("refuses a first import of a passage whose text is not the one stored races typed under its id", async () => {
    await storedRace(VERNE, "Un autre texte, tapé sous cet identifiant.");
    expect(await importCorpus(db, corpus())).toEqual({
      ok: false,
      refusal: { code: "STORED_RACE_TEXT_MISMATCH", passageId: VERNE, detail: `stored races typed another text under passage ${VERNE}` },
    });
    await storedRace(STEVENSON, fixture.en.passages[0]!.text);
    expect(await importCorpus(db, corpus())).toMatchObject({ ok: false, refusal: { code: "STORED_RACE_TEXT_MISMATCH", passageId: VERNE } });
  });

  it("accepts a first import whose passages are the texts stored races typed", async () => {
    await storedRace(VERNE, fixture.fr.passages[0]!.text);
    await storedRace(STEVENSON, fixture.en.passages[0]!.text);
    expect(reportOf(await importCorpus(db, corpus())).outcome).toBe("imported");
  });

  it("accepts the next versions after races drawn from the corpus, which typed a cut of a stored passage (F-02.3b)", async () => {
    await importCorpus(db, corpus());
    const cut = fixture.fr.passages[0]!.text.split(" ").slice(0, 50).join(" ");
    await storedRace(VERNE, cut, { corpusVersion: FIXTURE_VERSION, language: "fr" });
    expect(reportOf(await importCorpus(db, corpus(renamed(NEXT_VERSION))))).toMatchObject({ outcome: "imported", newPassages: 0, keptPassages: 2 });
    const withoutVerne = corpus((files) => {
      renamed("contract-2026-10-23")(files);
      files.fr.passages[0] = { ...files.fr.passages[0]!, id: "fr-verne-pacifique-bis" };
    });
    expect(reportOf(await importCorpus(db, withoutVerne))).toMatchObject({ outcome: "imported", retiredPassages: 1 });
    expect(await rows("select text_snapshot from races")).toEqual([{ text_snapshot: cut }]);
  });

  it("writes nothing when a statement fails half-way, and the version active before stays active", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    const next = corpus(renamed(NEXT_VERSION));
    // The checks never let this through; the database refuses it after the version row is written.
    const broken: CheckedCorpus = { ...next, passages: next.passages.map((passage) => ({ ...passage, id: `${passage.id}-bis`, contentHash: "not-a-hash" })) };
    await expect(importCorpus(db, broken)).rejects.toThrow();
    expect(await snapshot()).toEqual(before);
  });

  it("writes nothing when the activation itself fails", async () => {
    await importCorpus(db, corpus());
    const before = await snapshot();
    // Test only: make the activation of the next version fail, after its rows are written.
    await pool.query(`create function fail_activation() returns trigger language plpgsql as $$ begin raise exception 'activation refused'; end; $$`);
    await pool.query(`create trigger fail_activation before update on race_corpus_versions for each row when (new.active and new.version = '${NEXT_VERSION}') execute function fail_activation()`);
    // Drizzle wraps PostgreSQL's error: the cause is the activation's own refusal.
    await expect(importCorpus(db, corpus(renamed(NEXT_VERSION)))).rejects.toMatchObject({ cause: { message: "activation refused" } });
    expect(await snapshot()).toEqual(before);
  });

  /** Holds the import lock from a third connection until both imports wait for it, then lets them go. */
  async function overlapping(first: CheckedCorpus, second: CheckedCorpus): Promise<CorpusImportResult[]> {
    const holder = new pg.Client({ connectionString: database.url });
    const other = new pg.Pool({ connectionString: database.url, max: 2 });
    await holder.connect();
    try {
      await holder.query("begin");
      await holder.query("select pg_advisory_xact_lock($1)", [CORPUS_IMPORT_LOCK_KEY]);
      const imports = Promise.all([importCorpus(db, first), importCorpus(createDatabase(other), second)]);
      for (let attempt = 0; ; attempt += 1) {
        // This database's import lock only: other runs share the server.
        const [waiting] = await rows<{ count: number }>(
          "select count(*)::int as count from pg_locks where locktype = 'advisory' and not granted and database = (select oid from pg_database where datname = current_database()) and objid = $1 and objsubid = 1",
          [CORPUS_IMPORT_LOCK_KEY],
        );
        if (waiting?.count === 2) break;
        if (attempt > 100) throw new Error("the two imports never waited for the lock");
        await delay(50);
      }
      expect(await rows("select count(*)::int as count from race_corpus_versions")).toEqual([{ count: 0 }]);
      await holder.query("commit");
      return await imports;
    } finally {
      await holder.end();
      await other.end();
    }
  }

  it("serialises two imports of the same version: one imports, the other finds it unchanged", async () => {
    const results = await overlapping(corpus(), corpus());
    expect(results.map((result) => reportOf(result).outcome).sort()).toEqual(["imported", "unchanged"]);
    expect(await rows("select count(*)::int as count from race_corpus_versions")).toEqual([{ count: 1 }]);
    expect(await rows("select count(*)::int as count from race_corpus_entries")).toEqual([{ count: 2 }]);
  });

  it("serialises two imports of different versions: both complete, in order, the later one active, never a mix", async () => {
    const results = await overlapping(corpus(), corpus(renamed(NEXT_VERSION)));
    expect(results.map((result) => reportOf(result).outcome)).toEqual(["imported", "imported"]);
    expect(await rows("select version, count(*)::int as entries from race_corpus_entries group by version order by version")).toEqual([
      { version: FIXTURE_VERSION, entries: 2 },
      { version: NEXT_VERSION, entries: 2 },
    ]);
    // Times are taken after the lock: the active version is the one imported last.
    const [latest] = await rows<{ version: string; active: boolean }>("select version, active from race_corpus_versions order by imported_at desc limit 1");
    expect(latest?.active).toBe(true);
    expect(await rows("select count(*)::int as active from race_corpus_versions where active")).toEqual([{ active: 1 }]);
    expect(await rows("select count(*)::int as count from race_passages")).toEqual([{ count: 2 }]);
  });
});

describe("loadActiveCorpus", () => {
  it("refuses an active version that gained an entry outside an import", async () => {
    await importCorpus(db, corpus());
    await importCorpus(db, corpus((files) => {
      renamed(NEXT_VERSION)(files);
      files.fr.passages[0] = { ...files.fr.passages[0]!, id: "fr-verne-pacifique-bis" };
    }));
    // Inserting is the one write the triggers allow: the retired Verne slipped back into the active version.
    await pool.query(
      `insert into race_corpus_entries (version, passage_id, status, complexity, measures, editorial, checks)
       select $1, passage_id, status, complexity, measures, editorial, checks from race_corpus_entries where version = $2 and passage_id = $3`,
      [NEXT_VERSION, FIXTURE_VERSION, VERNE],
    );
    await expect(loadActiveCorpus(db)).rejects.toThrow(`Corpus version ${NEXT_VERSION} no longer matches its checksum`);
  });

  it("refuses a passage whose text changed behind the triggers' back", async () => {
    await importCorpus(db, corpus());
    // What only a table owner could do, as a later migration might: the fingerprint catches it.
    await pool.query("alter table race_passages disable trigger race_passages_append_only");
    await pool.query("update race_passages set text = replace(text, 'tranquille', 'calme') where id = $1", [VERNE]);
    await pool.query("alter table race_passages enable trigger race_passages_append_only");
    await expect(loadActiveCorpus(db)).rejects.toThrow(`Corpus passage ${VERNE} no longer matches its fingerprint`);
  });
});

describe("the corpus tables", () => {
  it("are append-only: content never changes, nothing is deleted or truncated; only the active flag moves", async () => {
    await importCorpus(db, corpus());
    const refused = { code: "23001" };
    for (const statement of [
      `update race_passages set text = 'Autre texte.' where id = '${VERNE}'`,
      `delete from race_passages where id = '${VERNE}'`,
      "truncate race_passages cascade",
      "update race_corpus_versions set checksum = repeat('0', 64)",
      "update race_corpus_versions set imported_at = now() - interval '1 day'",
      "delete from race_corpus_versions",
      "truncate race_corpus_versions cascade",
      "update race_corpus_entries set status = 'spare'",
      "delete from race_corpus_entries",
      "truncate race_corpus_entries",
    ]) {
      await expect(pool.query(statement), statement).rejects.toMatchObject(refused);
    }
    await pool.query("update race_corpus_versions set active = false");
    expect(await rows("select active from race_corpus_versions")).toEqual([{ active: false }]);
  });

  it("hold at most one active version", async () => {
    await importCorpus(db, corpus());
    await importCorpus(db, corpus(renamed(NEXT_VERSION)));
    await expect(pool.query("update race_corpus_versions set active = true")).rejects.toMatchObject({ code: "23505" });
  });

  it("refuse in the database what the checks refuse: an unknown language, a passage id of the other language", async () => {
    await importCorpus(db, corpus());
    const insert = (id: string, language: string) =>
      pool.query(
        `insert into race_passages (id, language, text, normalization_version, source_text, adaptations, source, word_count, content_hash, first_version)
         select $1, $2, text, normalization_version, source_text, adaptations, source, word_count, content_hash, first_version
         from race_passages where id = '${VERNE}'`,
        [id, language],
      );
    await expect(insert("de-verne-copie", "de")).rejects.toMatchObject({ code: "23514" });
    await expect(insert("en-verne-copie", "fr")).rejects.toMatchObject({ code: "23514", constraint: "race_passages_id_language" });
  });
});
