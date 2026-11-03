import { randomBytes, randomUUID } from "node:crypto";
import { parseRoomCode, ROOM_CODE_ALPHABET, type RoomCode, type RoomVisibility } from "@incision/domain";
import pg from "pg";
import { sqlStateOf } from "../src/errors";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { createGuestSession } from "../src/identity/guest-sessions";
import { runMigrations } from "../src/migrations";
import { startRace } from "../src/races/lifecycle";
import { createRoomWithHost } from "../src/rooms/create-room";
import { joinRoomByCode } from "../src/rooms/membership";
import { quickplayAccount, quickplayCandidates, quickplayGuest } from "../src/rooms/quickplay";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 10 });
  db = createDatabase(pool);
});
afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies");
  await pool.query("delete from races");
  await pool.query("delete from guest_sessions");
  await pool.query("delete from accounts");
});
afterAll(async () => { await pool?.end(); await database?.drop(); });

async function account(name: string): Promise<string> {
  return (await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [name])).rows[0]!.id;
}
async function guest() {
  const proof = { id: randomUUID(), secretDigest: randomBytes(32).toString("hex") };
  await createGuestSession(db, proof);
  return proof;
}
function roomCode(value: string): RoomCode {
  const parsed = parseRoomCode(value);
  if (!parsed.ok) throw new Error("Invalid test code");
  return parsed.code;
}
/** A room with its host as a participant, `bots` bots, and an explicit creation time. */
async function room(code: string, visibility: RoomVisibility, options: { capacity?: number; bots?: number; age?: number } = {}) {
  let draw = 0;
  const host = await account(`Host ${code}`);
  const result = await createRoomWithHost(db, { accountId: host, role: "participant", capacity: options.capacity ?? 30,
    visibility, randomIndex: () => ROOM_CODE_ALPHABET.indexOf(code[draw++]!) });
  if (!result.ok) throw new Error(result.error);
  const lobbyId = result.room.id;
  hosts.set(lobbyId, host);
  for (let n = 0; n < (options.bots ?? 0); n++) await pool.query("insert into lobby_bots (lobby_id, level) values ($1, 'noob')", [lobbyId]);
  await pool.query("update lobbies set created_at = now() - make_interval(mins => $2) where id = $1", [lobbyId, options.age ?? 0]);
  return lobbyId;
}
const hosts = new Map<string, string>();
/** A real race start, as the phase constraint requires a race for countdown and racing. */
async function race(lobbyId: string) {
  const started = await startRace(db, { accountId: hosts.get(lobbyId)!, lobbyId, settingsRevision: 0,
    ownerId: "00000000-0000-4000-8000-00000000000a", text: "La mer est calme.", config: {}, rulesVersion: 1,
    create: () => ({ ok: true as const, race: true }) });
  if (!started.ok) throw new Error("Race fixture did not start");
}
async function participants(lobbyId: string): Promise<number> {
  const { rows } = await pool.query<{ n: number }>(`select (select count(*) from lobby_members where lobby_id=$1 and role='participant' and left_at is null)
    + (select count(*) from lobby_bots where lobby_id=$1) as n`, [lobbyId]);
  return Number(rows[0]!.n);
}
async function blocked() {
  for (let n = 0; n < 200; n++) {
    const result = await pool.query("select count(*)::int as n from pg_stat_activity where datname=current_database() and wait_event_type='Lock'");
    if (result.rows[0]?.n > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Quickplay did not wait on the held lock");
}
const subjectOf = (accountId: string) => ({ kind: "account", accountId } as const);

describe("quickplay candidates (JOIN-03, D-05)", () => {
  it("orders admissible PUBLIC rooms by fewest free places, then age, then id", async () => {
    const roomy = await room("AAAAAA", "public", { capacity: 30, age: 50 });
    const older = await room("BBBBBB", "public", { capacity: 4, bots: 1, age: 40 });
    const newer = await room("CCCCCC", "public", { capacity: 4, bots: 1, age: 30 });
    await room("DDDDDD", "code", { capacity: 2, age: 60 });
    await room("EEEEEE", "private", { capacity: 2, age: 60 });
    const racing = await room("FFFFFF", "public", { capacity: 3, age: 60 });
    await race(racing);
    await room("GGGGGG", "public", { capacity: 2, bots: 1, age: 60 });
    const closed = await room("HHHHHH", "public", { capacity: 3, age: 60 });
    await pool.query("update lobbies set phase='closed', closed_at=now() where id=$1", [closed]);
    const results = await room("JJJJJJ", "public", { capacity: 30, bots: 1, age: 10 });
    await race(results);
    await pool.query("update lobbies set phase='results' where id=$1", [results]);

    const candidates = await quickplayCandidates(db, subjectOf(await account("Seeker")));
    expect(candidates.map((candidate) => candidate.id)).toEqual([older, newer, results, roomy]);
    expect(Object.keys(candidates[0]!).sort()).toEqual(["code", "id"]);
  });

  it("breaks an exact tie on the id and ignores spectators and members who left", async () => {
    const first = await room("AAAAAA", "public", { capacity: 3 });
    const second = await room("BBBBBB", "public", { capacity: 3 });
    await pool.query("update lobbies set created_at = '2026-11-01T00:00:00Z' where id in ($1, $2)", [first, second]);
    await joinRoomByCode(db, { accountId: await account("Watcher"), code: roomCode("AAAAAA"), role: "spectator" });
    const left = await joinRoomByCode(db, { accountId: await account("Gone"), code: roomCode("AAAAAA"), role: "participant" });
    if (left.ok) await pool.query("update lobby_members set left_at=now() where id=$1", [left.memberId]);
    const ids = (await quickplayCandidates(db, subjectOf(await account("Seeker")))).map((candidate) => candidate.id);
    expect(ids).toEqual([first, second].sort());
  });

  it("skips a room without a host, as the public list does", async () => {
    const hostless = await room("AAAAAA", "public", { capacity: 2, age: 10 });
    const hosted = await room("BBBBBB", "public", { capacity: 30, age: 20 });
    await pool.query("update lobbies set host_member_id = null where id = $1", [hostless]);
    const seeker = await account("Seeker");
    expect(await quickplayCandidates(db, subjectOf(seeker))).toEqual([expect.objectContaining({ id: hosted })]);
    expect(await quickplayAccount(db, seeker)).toMatchObject({ ok: true, lobbyId: hosted });
  });

  it("skips a room that banned this subject, and only for this subject", async () => {
    const tight = await room("AAAAAA", "public", { capacity: 2 });
    const roomy = await room("BBBBBB", "public", { capacity: 30 });
    const banned = await account("Banned");
    const proof = await guest();
    await pool.query("insert into lobby_bans (lobby_id, account_id) values ($1, $2)", [tight, banned]);
    await pool.query("insert into lobby_bans (lobby_id, guest_session_id) values ($1, $2)", [roomy, proof.id]);
    expect((await quickplayCandidates(db, subjectOf(banned))).map((c) => c.id)).toEqual([roomy]);
    expect((await quickplayCandidates(db, { kind: "guest", guestSessionId: proof.id })).map((c) => c.id)).toEqual([tight]);
    expect((await quickplayCandidates(db, subjectOf(await account("Other")))).map((c) => c.id)).toEqual([tight, roomy]);
  });
});

describe("quickplay admission (JOIN-03, D-05)", () => {
  it("admits an account as a participant in the first candidate and never creates a room", async () => {
    await room("AAAAAA", "public", { capacity: 30, age: 10 });
    const tight = await room("BBBBBB", "public", { capacity: 3, age: 5 });
    const seeker = await account("Seeker");
    const result = await quickplayAccount(db, seeker);
    expect(result).toMatchObject({ ok: true, lobbyId: tight, code: "BBBBBB", alreadyMember: false });
    expect((await pool.query("select role from lobby_members where account_id=$1 and left_at is null", [seeker])).rows).toEqual([{ role: "participant" }]);
    expect((await pool.query("select count(*)::int as n from lobbies")).rows[0].n).toBe(2);
  });

  it("answers NO_ROOM without creating anything when nothing is admissible", async () => {
    await room("AAAAAA", "code");
    await room("BBBBBB", "public", { capacity: 2, bots: 1 });
    const before = (await pool.query("select count(*)::int as n from lobbies")).rows[0].n;
    expect(await quickplayAccount(db, await account("Seeker"))).toEqual({ ok: false, error: "NO_ROOM" });
    expect(await quickplayGuest(db, { proof: await guest(), nickname: "Léa" })).toEqual({ ok: false, error: "NO_ROOM" });
    expect((await pool.query("select count(*)::int as n from lobbies")).rows[0].n).toBe(before);
    expect((await pool.query("select count(*)::int as n from lobby_members")).rows[0].n).toBe(2);
  });

  it("sends a member of another room back to it instead of moving them", async () => {
    await room("AAAAAA", "public");
    const seeker = await account("Seeker");
    const own = await room("BBBBBB", "code");
    const joined = await joinRoomByCode(db, { accountId: seeker, code: roomCode("BBBBBB"), role: "spectator" });
    expect(joined.ok).toBe(true);
    expect(await quickplayAccount(db, seeker)).toEqual({ ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: "BBBBBB" });
    expect((await pool.query("select lobby_id from lobby_members where account_id=$1 and left_at is null", [seeker])).rows).toEqual([{ lobby_id: own }]);
  });

  it("fills the last place once under concurrent requests; the loser takes the next candidate", async () => {
    const tight = await room("AAAAAA", "public", { capacity: 2, age: 10 });
    const roomy = await room("BBBBBB", "public", { capacity: 30, age: 20 });
    const seekers = await Promise.all(Array.from({ length: 6 }, (_, n) => account(`Seeker ${n}`)));
    const results = await Promise.all(seekers.map((seeker) => quickplayAccount(db, seeker)));
    expect(results.every((result) => result.ok)).toBe(true);
    const rooms = results.map((result) => result.ok ? result.lobbyId : undefined);
    expect(rooms.filter((id) => id === tight)).toHaveLength(1);
    expect(rooms.filter((id) => id === roomy)).toHaveLength(5);
    expect(await participants(tight)).toBe(2);
  });

  it("rechecks phase and visibility under the lock and moves on when the room changed meanwhile", async () => {
    const changes = ["update lobbies set phase='closed', closed_at=now() where id=$1", "update lobbies set visibility='private' where id=$1",
      "insert into lobby_bots (lobby_id, level) values ($1, 'noob')"];
    for (const change of changes) {
      const tight = await room("AAAAAA", "public", { capacity: 2, age: 10 });
      const roomy = await room("BBBBBB", "public", { capacity: 30, age: 20 });
      const holder = await pool.connect();
      try {
        await holder.query("begin");
        await holder.query("select id from lobbies where id=$1 for update", [tight]);
        const pending = quickplayAccount(db, await account(`Seeker ${changes.indexOf(change)}`));
        await blocked();
        await holder.query(change, [tight]);
        await holder.query("commit");
        expect(await pending).toMatchObject({ ok: true, lobbyId: roomy });
      } finally {
        holder.release();
      }
      expect(await participants(tight)).toBe(change.startsWith("insert") ? 2 : 1);
      await pool.query("update lobbies set host_member_id = null");
      await pool.query("delete from lobbies");
    }
  });

  it("moves on when a room stays locked past lock_timeout, and reports contention when every room does", async () => {
    const tight = await room("AAAAAA", "public", { capacity: 2, age: 10 });
    const roomy = await room("BBBBBB", "public", { capacity: 30, age: 20 });
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from lobbies where id=$1 for update", [tight]);
      expect(await quickplayAccount(db, await account("Patient"))).toMatchObject({ ok: true, lobbyId: roomy });
      await holder.query("select id from lobbies where id=$1 for update", [roomy]);
      // Every candidate is busy: not NO_ROOM (that would offer to create a room), but the lock error.
      const failure = await quickplayAccount(db, await account("Unlucky")).then(() => undefined, (error: unknown) => error);
      expect(sqlStateOf(failure)).toBe("55P03");
      const guestFailure = await quickplayGuest(db, { proof: await guest(), nickname: "Mousse" }).then(() => undefined, (error: unknown) => error);
      expect(sqlStateOf(guestFailure)).toBe("55P03");
    } finally {
      await holder.query("rollback");
      holder.release();
    }
    expect(await participants(tight)).toBe(1);
  }, 30_000);

  it("refuses a ban added after the candidate list and tries the next room", async () => {
    const tight = await room("AAAAAA", "public", { capacity: 2, age: 10 });
    const roomy = await room("BBBBBB", "public", { capacity: 30, age: 20 });
    const seeker = await account("Seeker");
    const holder = await pool.connect();
    try {
      await holder.query("begin");
      await holder.query("select id from lobbies where id=$1 for update", [tight]);
      const pending = quickplayAccount(db, seeker);
      await blocked();
      await holder.query("insert into lobby_bans (lobby_id, account_id) values ($1, $2)", [tight, seeker]);
      await holder.query("commit");
      expect(await pending).toMatchObject({ ok: true, lobbyId: roomy });
    } finally {
      holder.release();
    }
  });
});

describe("quickplay for guests (JOIN-03)", () => {
  it("admits a valid guest as a participant with the nickname and renews the session", async () => {
    const lobbyId = await room("AAAAAA", "public", { capacity: 4 });
    const proof = await guest();
    const result = await quickplayGuest(db, { proof, nickname: "  Léa  " });
    expect(result).toMatchObject({ ok: true, lobbyId, code: "AAAAAA", guestSession: { id: proof.id } });
    expect((await pool.query("select role, display_name from lobby_members where guest_session_id=$1", [proof.id])).rows)
      .toEqual([{ role: "participant", display_name: "Léa" }]);
  });

  it("moves past a room where the nickname is taken, and says so when it is taken everywhere", async () => {
    await room("AAAAAA", "public", { capacity: 4, age: 10 });
    const first = await quickplayGuest(db, { proof: await guest(), nickname: "Léa" });
    expect(first).toMatchObject({ ok: true, code: "AAAAAA" });
    const second = await quickplayGuest(db, { proof: await guest(), nickname: "LÉA" });
    expect(second).toEqual({ ok: false, error: "NICKNAME_TAKEN" });
    const roomy = await room("BBBBBB", "public", { capacity: 30, age: 20 });
    expect(await quickplayGuest(db, { proof: await guest(), nickname: "Léa" })).toMatchObject({ ok: true, lobbyId: roomy });
  });

  it("refuses an invalid or expired session and an invalid nickname before admitting anyone", async () => {
    await room("AAAAAA", "public");
    const forged = { id: randomUUID(), secretDigest: randomBytes(32).toString("hex") };
    expect(await quickplayGuest(db, { proof: forged, nickname: "Léa" })).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
    const proof = await guest();
    expect(await quickplayGuest(db, { proof: { ...proof, secretDigest: forged.secretDigest }, nickname: "Léa" }))
      .toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
    expect(await quickplayGuest(db, { proof, nickname: "" })).toMatchObject({ ok: false, error: "INVALID_GUEST_NICKNAME" });
    await pool.query(`update guest_sessions set created_at=now()-interval '2 days', last_seen_at=now()-interval '25 hours',
      expires_at=now()-interval '1 hour' where id=$1`, [proof.id]);
    expect(await quickplayGuest(db, { proof, nickname: "Léa" })).toEqual({ ok: false, error: "INVALID_GUEST_SESSION" });
    expect((await pool.query("select count(*)::int as n from lobby_members where guest_session_id is not null")).rows[0].n).toBe(0);
  });

  it("sends a guest already in a room back to it", async () => {
    await room("AAAAAA", "public", { capacity: 4 });
    await room("BBBBBB", "code");
    const proof = await guest();
    const own = await quickplayGuest(db, { proof, nickname: "Léa" });
    expect(own).toMatchObject({ ok: true, code: "AAAAAA" });
    expect(await quickplayGuest(db, { proof, nickname: "Léa" })).toEqual({ ok: false, error: "ALREADY_IN_ANOTHER_ROOM", currentCode: "AAAAAA" });
  });
});
