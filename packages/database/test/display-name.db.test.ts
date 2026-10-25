import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { findOrCreateOAuthAccount, readAccountProfile, updateAccountDisplayName } from "../src/identity/accounts";
import { runMigrations } from "../src/migrations";
import { createRoomWithHost } from "../src/rooms/create-room";
import { startRace } from "../src/races/lifecycle";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let temporary: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await runMigrations({ connectionString: temporary.url });
  pool = new pg.Pool({ connectionString: temporary.url });
  db = createDatabase(pool);
});
afterAll(async () => { await pool.end(); await temporary.drop(); });

describe("account-scoped display name update", () => {
  it("changes only the name (and audit timestamp), not credentials, sessions or another account", async () => {
    const inserted = await pool.query<{ id: string }>("insert into accounts(login, login_canonical, display_name) values ('Alice','alice','Old Alice'),('Bob','bob','Bob') returning id");
    const id = inserted.rows[0]!.id;
    const before = await pool.query("select id, login, login_canonical, password_hash, session_version, created_at from accounts order by id");
    expect(await updateAccountDisplayName(db, { accountId: id, displayName: "Capitaine" })).toEqual({ displayName: "Capitaine" });
    expect((await pool.query("select id, login, login_canonical, password_hash, session_version, created_at from accounts order by id")).rows).toEqual(before.rows);
    expect(await readAccountProfile(db, inserted.rows[1]!.id)).toEqual({ displayName: "Bob" });
    expect(await updateAccountDisplayName(db, { accountId: id, displayName: "Capitaine" })).toEqual({ displayName: "Capitaine" });
    // No global display-name uniqueness: room admission retains its own constraint.
    expect(await updateAccountDisplayName(db, { accountId: id, displayName: "Bob" })).toEqual({ displayName: "Bob" });
  });

  it("does not let a provider overwrite an edited name on later OAuth sign-in", async () => {
    const signIn = { provider: "github", providerSubject: "profile-name-test", initialDisplayName: "Original" } as const;
    const account = await findOrCreateOAuthAccount(db, signIn);
    const identities = (await pool.query("select * from oauth_identities")).rows;
    await updateAccountDisplayName(db, { accountId: account.accountId, displayName: "Edited" });
    expect(await findOrCreateOAuthAccount(db, { ...signIn, initialDisplayName: "Upstream" })).toEqual(account);
    expect(await readAccountProfile(db, account.accountId)).toEqual({ displayName: "Edited" });
    expect((await pool.query("select * from oauth_identities")).rows).toEqual(identities);
  });

  it("preserves active room and historical entrant snapshots", async () => {
    const account = await findOrCreateOAuthAccount(db, { provider: "discord", providerSubject: "snapshot", initialDisplayName: "Room Name" });
    expect((await createRoomWithHost(db, { accountId: account.accountId, role: "participant", visibility: "code", capacity: 8, randomIndex: () => 0 })).ok).toBe(true);
    const before = (await pool.query("select * from lobby_members where account_id = $1", [account.accountId])).rows;
    // One entrant is sufficient for this storage fixture; production's pure rule checks two.
    const race = await startRace(db, { accountId: account.accountId, ownerId: "00000000-0000-4000-8000-000000000001",
      text: "La mer.", config: { language: "fr" }, rulesVersion: 1, create: () => ({ ok: true as const, race: {} }) });
    expect(race.ok).toBe(true);
    const entrants = (await pool.query("select * from race_entrants where account_id = $1", [account.accountId])).rows;
    expect(entrants).toHaveLength(1);
    await updateAccountDisplayName(db, { accountId: account.accountId, displayName: "Next Room" });
    expect((await pool.query("select * from lobby_members where account_id = $1", [account.accountId])).rows).toEqual(before);
    expect((await pool.query("select * from race_entrants where account_id = $1", [account.accountId])).rows).toEqual(entrants);
  });

  it("reports a missing account and uses the last committed write", async () => {
    expect(await updateAccountDisplayName(db, { accountId: "00000000-0000-4000-8000-000000000000", displayName: "Nobody" })).toBeUndefined();
    const account = await findOrCreateOAuthAccount(db, { provider: "github", providerSubject: "last-write", initialDisplayName: "Initial" });
    await Promise.all(["First", "Second"].map((displayName) => updateAccountDisplayName(db, { accountId: account.accountId, displayName })));
    await updateAccountDisplayName(db, { accountId: account.accountId, displayName: "Last" });
    expect(await readAccountProfile(db, account.accountId)).toEqual({ displayName: "Last" });
  });
});
