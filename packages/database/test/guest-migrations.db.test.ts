import { randomUUID } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { asDuration, collectWpmObservation, createWpmSeries, freezeStoredWpmSeries } from "@incision/domain";
import pg from "pg";
import { expect, it } from "vitest";
import { createDatabase } from "../src/client";
import { createGuestSession, purgeUnusedGuestSessions } from "../src/identity/guest-sessions";
import { MIGRATIONS_FOLDER, runMigrations } from "../src/migrations";
import { readRaceForEntrant } from "../src/races/results";
import { readAccountStatistics } from "../src/races/profile-statistics";
import { createTemporaryDatabase } from "./test-database";

it.each([
  { predecessor: "0012_third_human_cannonball", wordCount: 10 },
  { predecessor: "0012_third_human_cannonball", wordCount: 200 },
  { predecessor: "0013_guest_identity_foundation", wordCount: 10 },
  { predecessor: "0013_guest_identity_foundation", wordCount: 200 },
])("upgrades $predecessor preserving $wordCount-word settings, photos and account results through guest cleanup", async ({ predecessor, wordCount }) => {
  const database = await createTemporaryDatabase();
  const folder = mkdtempSync(path.join(tmpdir(), "incision-guest-migration-"));
  const journal: { entries: { tag: string }[] } = JSON.parse(readFileSync(path.join(MIGRATIONS_FOLDER, "meta/_journal.json"), "utf8"));
  const last = journal.entries.findIndex((entry) => entry.tag === predecessor);
  if (last < 0) throw new Error("Missing predecessor");
  const entries = journal.entries.slice(0, last + 1);
  mkdirSync(path.join(folder, "meta"));
  writeFileSync(path.join(folder, "meta/_journal.json"), JSON.stringify({ ...journal, entries }));
  for (const { tag } of entries) writeFileSync(path.join(folder, `${tag}.sql`), readFileSync(path.join(MIGRATIONS_FOLDER, `${tag}.sql`)));
  const pool = new pg.Pool({ connectionString: database.url });
  try {
    await runMigrations({ connectionString: database.url, migrationsFolder: folder });
    const account = randomUUID(), lobby = randomUUID(), member = randomUUID(), race = randomUUID(), entrant = randomUUID();
    await pool.query("insert into accounts(id,display_name) values($1,'Account')", [account]);
    await pool.query("insert into lobbies(id,code,capacity) values($1,'ABCDEF',30)", [lobby]);
    await pool.query("insert into lobby_settings(lobby_id,text_language,time_limit_ms,error_mode,word_count) values($1,'en',null,'free',$2)", [lobby, wordCount]);
    // Synthetic RIFF/WEBP header, never a recipe photo or personal data.
    await pool.query("insert into profile_photos(account_id,webp) values($1,decode('524946460000000057454250','hex'))", [account]);
    await pool.query("insert into lobby_members(id,lobby_id,account_id,role,display_name,display_name_canonical) values($1,$2,$3,'participant','Account','account')", [member,lobby,account]);
    await pool.query(`insert into races(id,lobby_id,round_no,state,rules_version,text_snapshot,config_snapshot,countdown_at,started_at,ended_at,owner_id,lease_expires_at)
      values($1,$2,1,'finished',1,'abc','{}',now()-interval '3 minutes',now()-interval '2 minutes',now()-interval '1 minute',gen_random_uuid(),now())`, [race,lobby]);
    await pool.query("insert into race_entrants(id,race_id,member_id,account_id,ordinal,display_name_snapshot) values($1,$2,$3,$4,1,'Account')", [entrant,race,member,account]);
    await pool.query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy)
      values($1,$2,'finished',1,60000,3,3,3,4,0.6,0.8,75)`, [race,entrant]);
    const terminal = { elapsed: asDuration(60000), counters: { correctInserts: 3, totalInserts: 4 } };
    const final = collectWpmObservation(createWpmSeries(), { kind: "finalize", ...terminal });
    if (!final.ok) throw new Error(final.refusal);
    const series = freezeStoredWpmSeries(final.series, terminal);
    if (!series.ok) throw new Error(series.refusal);
    await pool.query("insert into race_wpm_series(race_id,entrant_id,series) values($1,$2,$3)", [race,entrant,series.value]);
    await pool.query("insert into race_key_errors(race_id,entrant_id,aggregate) values($1,$2,$3)", [race,entrant,{ version: 1, keys: [{ grapheme: "a", count: 1 }] }]);
    const db = createDatabase(pool);
    const protectedTables = ["accounts", "races", "race_entrants", "race_results", "race_wpm_series", "race_key_errors", "lobby_members", "lobby_settings", "profile_photos"];
    const storedBefore = await Promise.all(protectedTables.map(async (table) => {
      const rows = (await pool.query(`select * from ${table}`)).rows;
      // 0013 adds this nullable column; its explicit expected value is not data loss.
      return table === "lobby_members" && predecessor === "0012_third_human_cannonball"
        ? rows.map((row) => ({ ...row, guest_session_id: null })) : rows;
    }));
    const before = await readRaceForEntrant(db, race, account);
    const stats = await readAccountStatistics(db, account);
    const resultRows = (await pool.query("select * from race_results")).rows;
    const settings = (await pool.query("select * from lobby_settings")).rows;
    const photos = (await pool.query("select * from profile_photos")).rows;
    expect(await runMigrations({ connectionString: database.url })).toEqual({ applied: journal.entries.length - entries.length });
    const storedAfter = await Promise.all(protectedTables.map(async (table) => (await pool.query(`select * from ${table}`)).rows));
    expect(storedAfter).toEqual(storedBefore);
    expect((await pool.query("select * from lobby_settings")).rows).toEqual(settings);
    expect((await pool.query("select * from profile_photos")).rows).toEqual(photos);
    expect(await readRaceForEntrant(db, race, account)).toEqual(before);
    expect(await readAccountStatistics(db, account)).toEqual(stats);
    expect((await pool.query("select * from race_results")).rows).toEqual(resultRows);
    expect((await pool.query("select account_id,guest_session_id from lobby_members")).rows).toEqual([{ account_id: account, guest_session_id: null }]);
    expect(await runMigrations({ connectionString: database.url, migrationsFolder: folder })).toEqual({ applied: 0 });
    const guest = { id: randomUUID(), secretDigest: "f".repeat(64) };
    await createGuestSession(db, guest);
    await pool.query("update guest_sessions set created_at=now()-interval '2 days', last_seen_at=now()-interval '25 hours', expires_at=now()-interval '1 hour'");
    expect(await purgeUnusedGuestSessions(db)).toBe(1);
    await pool.query("delete from lobbies where id=$1", [lobby]);
    expect(await readRaceForEntrant(db, race, account)).toEqual(before);
    expect(await readAccountStatistics(db, account)).toEqual(stats);
    expect((await pool.query("select * from race_results")).rows).toEqual(resultRows);
    expect(before?.personalKeyErrors?.keys).toEqual([{ grapheme: "a", count: 1 }]);
    expect((await pool.query("select * from profile_photos")).rows).toEqual(photos);
    expect(before?.entrants[0]?.result?.wpmSeries).toEqual(series.value);
  } finally {
    await pool.end(); await database.drop(); rmSync(folder, { recursive: true, force: true });
  }
});
