import { parseRoomCode } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode, leaveCurrentRoom, readRoomSnapshot } from "../src/rooms/membership";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 8 });
  db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from accounts");
});
afterAll(async () => {
  await pool?.end();
  await database?.drop();
});

async function account(name: string): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [name]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("Missing fixture account");
  return id;
}

async function fixture(spectators: number, hostRole: "participant" | "spectator" = "participant") {
  const hostId = await account("Host");
  const created = await createRoomWithHost(db, {
    accountId: hostId, role: hostRole, visibility: "code", capacity: 2, randomIndex: () => 0,
  });
  if (!created.ok) throw new Error(created.error);
  const parsed = parseRoomCode(created.room.code);
  if (!parsed.ok) throw new Error("Invalid fixture code");
  const code = parsed.code;
  const spectatorIds: string[] = hostRole === "spectator" ? [hostId] : [];
  for (let index = spectatorIds.length; index < spectators; index += 1) {
    const id = await account(`Spectator ${index}`);
    expect(await joinRoomByCode(db, { accountId: id, code, role: "spectator" })).toMatchObject({ ok: true, alreadyMember: false });
    spectatorIds.push(id);
  }
  return { lobbyId: created.room.id, code, spectatorIds, hostId };
}

async function counts(lobbyId: string) {
  const result = await pool.query<{ role: string; count: number }>(
    "select role, count(*)::int as count from lobby_members where lobby_id=$1 and left_at is null group by role order by role", [lobbyId],
  );
  return result.rows;
}

describe("D-22 spectator admission under the lobby lock", () => {
  it("admits the twentieth, refuses the next without changing the revision, and keeps participant slots separate", async () => {
    const room = await fixture(19);
    expect(await joinRoomByCode(db, { accountId: await account("Twentieth"), code: room.code, role: "spectator" })).toMatchObject({ ok: true });
    const before = await readRoomSnapshot(db, room.lobbyId);
    expect(await joinRoomByCode(db, { accountId: await account("Overflow"), code: room.code, role: "spectator" })).toEqual({ ok: false, error: "SPECTATORS_FULL" });
    expect((await readRoomSnapshot(db, room.lobbyId))?.revision).toBe(before?.revision);
    expect(await joinRoomByCode(db, { accountId: await account("Runner"), code: room.code, role: "participant" })).toMatchObject({ ok: true });
    expect(await joinRoomByCode(db, { accountId: await account("Extra runner"), code: room.code, role: "participant" })).toEqual({ ok: false, error: "ROOM_FULL" });
    expect(await counts(room.lobbyId)).toEqual([{ role: "participant", count: 2 }, { role: "spectator", count: 20 }]);
  });

  it("serializes two contenders for the last spectator slot", async () => {
    const room = await fixture(19);
    const ids = await Promise.all([account("First"), account("Second")]);
    const results = await Promise.all(ids.map((accountId) => joinRoomByCode(db, { accountId, code: room.code, role: "spectator" })));
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "SPECTATORS_FULL" }]);
    expect(await counts(room.lobbyId)).toContainEqual({ role: "spectator", count: 20 });
  });

  it("returns an existing membership at capacity without incrementing occupancy or revision", async () => {
    const room = await fixture(20);
    const accountId = room.spectatorIds[0];
    if (!accountId) throw new Error("Missing spectator");
    const before = await readRoomSnapshot(db, room.lobbyId);
    const results = await Promise.all(["spectator", "participant"].map((role) =>
      joinRoomByCode(db, { accountId, code: room.code, role: role === "spectator" ? "spectator" : "participant" })));
    for (const result of results) expect(result).toMatchObject({ ok: true, alreadyMember: true });
    expect(await readRoomSnapshot(db, room.lobbyId)).toEqual(before);
  });

  it("releases a departed spectator's place, including when the host is a spectator", async () => {
    const room = await fixture(20, "spectator");
    const departed = room.spectatorIds[1];
    if (!departed) throw new Error("Missing non-host spectator");
    expect(await joinRoomByCode(db, { accountId: await account("Full"), code: room.code, role: "spectator" })).toEqual({ ok: false, error: "SPECTATORS_FULL" });
    await leaveCurrentRoom(db, departed);
    expect(await joinRoomByCode(db, { accountId: await account("Replacement"), code: room.code, role: "spectator" })).toMatchObject({ ok: true });
    expect(await counts(room.lobbyId)).toEqual([{ role: "spectator", count: 20 }]);
  });

  it("keeps phase refusals and private-code indistinguishability ahead of quota details", async () => {
    const room = await fixture(20);
    const accountId = await account("Outsider");
    // Active phases require an associated race; keep the fixture consistent with DB constraints.
    await pool.query(`with race as (
      insert into races (lobby_id, round_no, rules_version, text_snapshot, config_snapshot, countdown_at, owner_id, lease_expires_at)
      values ($1, 1, 1, 'x', '{}', statement_timestamp(), gen_random_uuid(), statement_timestamp()) returning id
    ) update lobbies set current_race_id=race.id from race where lobbies.id=$1`, [room.lobbyId]);
    for (const phase of ["countdown", "racing", "closed"]) {
      await pool.query("update lobbies set phase=$1, closed_at=case when $1='closed' then now() else null end where id=$2", [phase, room.lobbyId]);
      expect(await joinRoomByCode(db, { accountId, code: room.code, role: "spectator" })).toEqual({ ok: false, error: "ROOM_NOT_ADMITTING", phase });
    }
    await pool.query("update lobbies set phase='waiting', closed_at=null, visibility='private' where id=$1", [room.lobbyId]);
    expect(await joinRoomByCode(db, { accountId, code: room.code, role: "spectator" })).toEqual({ ok: false, error: "ROOM_NOT_FOUND" });
  });
});
