import { ROOM_CODE_ALPHABET, type RandomIndex } from "@incision/domain";
import pg from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { runMigrations } from "../src/migrations";
import { createRoomWithHost, type CreateRoomInput } from "../src/rooms/create-room";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  pool = new pg.Pool({ connectionString: database.url, max: 4 });
  db = createDatabase(pool);
});

afterEach(async () => {
  await pool.query("update lobbies set host_member_id = null");
  await pool.query("delete from lobbies");
  await pool.query("delete from accounts");
});

afterAll(async () => {
  await pool.end();
  await database.drop();
});

/** Picks the alphabet indexes of the given codes, one code after another. */
function codes(...values: string[]): RandomIndex {
  const indexes = values.flatMap((value) => [...value].map((character) => ROOM_CODE_ALPHABET.indexOf(character)));
  let call = 0;
  return () => indexes[call++ % indexes.length] ?? 0;
}

async function newAccount(displayName = "Créateur"): Promise<string> {
  const result = await pool.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [displayName]);
  return result.rows[0]?.id ?? "";
}

function input(accountId: string, randomIndex: RandomIndex, overrides: Partial<CreateRoomInput> = {}): CreateRoomInput {
  return { accountId, role: "participant", visibility: "code", capacity: 8, randomIndex, ...overrides };
}

async function counts(): Promise<{ lobbies: number; members: number }> {
  const result = await pool.query<{ lobbies: string; members: string }>(
    "select (select count(*) from lobbies) as lobbies, (select count(*) from lobby_members) as members",
  );
  return { lobbies: Number(result.rows[0]?.lobbies), members: Number(result.rows[0]?.members) };
}

describe("createRoomWithHost", () => {
  it("creates the room, its active host member and the host link together", async () => {
    const accountId = await newAccount("Émile");
    const result = await createRoomWithHost(db, input(accountId, codes("ABCDEF"), { role: "spectator" }));
    expect(result).toMatchObject({ ok: true, room: { code: "ABCDEF" } });
    const rows = await pool.query(
      "select l.code, l.phase, m.role, m.display_name, m.display_name_canonical, m.left_at from lobbies l join lobby_members m on m.id = l.host_member_id",
    );
    expect(rows.rows).toEqual([
      { code: "ABCDEF", phase: "waiting", role: "spectator", display_name: "Émile", display_name_canonical: "émile", left_at: null },
    ]);
  });

  it("returns ALREADY_IN_ROOM for an account already in a room, leaving nothing behind", async () => {
    const accountId = await newAccount();
    await createRoomWithHost(db, input(accountId, codes("ABCDEF")));
    expect(await createRoomWithHost(db, input(accountId, codes("BCDEFG")))).toEqual({ ok: false, error: "ALREADY_IN_ROOM" });
    expect(await counts()).toEqual({ lobbies: 1, members: 1 });
  });

  it("lets only one of two concurrent creations by the same account succeed", async () => {
    const accountId = await newAccount();
    const results = await Promise.all([
      createRoomWithHost(db, input(accountId, codes("CDEFGH"))),
      createRoomWithHost(db, input(accountId, codes("DEFGHJ"))),
    ]);
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toEqual([{ ok: false, error: "ALREADY_IN_ROOM" }]);
    expect(await counts()).toEqual({ lobbies: 1, members: 1 });
  });

  it("retries the whole transaction with a new code after a collision", async () => {
    await createRoomWithHost(db, input(await newAccount("Premier"), codes("ABCDEF")));
    const result = await createRoomWithHost(db, input(await newAccount("Second"), codes("ABCDEF", "BCDEFG")));
    expect(result).toMatchObject({ ok: true, room: { code: "BCDEFG" } });
    expect(await counts()).toEqual({ lobbies: 2, members: 2 });
  });

  it("lets two accounts racing on the same first code both succeed with distinct codes", async () => {
    const [first, second] = await Promise.all([newAccount("Premier"), newAccount("Second")]);
    const results = await Promise.all([
      createRoomWithHost(db, input(first, codes("EFGHJK", "FGHJKM"))),
      createRoomWithHost(db, input(second, codes("EFGHJK", "GHJKMN"))),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    const roomCodes = results.map((result) => (result.ok ? result.room.code : ""));
    expect(new Set(roomCodes).size).toBe(2);
    expect(roomCodes).toContain("EFGHJK");
    expect(await counts()).toEqual({ lobbies: 2, members: 2 });
  });

  it("stops after the bounded number of attempts when every code collides", async () => {
    await createRoomWithHost(db, input(await newAccount("Premier"), codes("ABCDEF")));
    const result = await createRoomWithHost(db, input(await newAccount("Second"), codes("ABCDEF")), 3);
    expect(result).toEqual({ ok: false, error: "CODE_ATTEMPTS_EXHAUSTED" });
    expect(await counts()).toEqual({ lobbies: 1, members: 1 });
  });

  it("reports an unknown account without writing anything", async () => {
    const result = await createRoomWithHost(db, input("00000000-0000-4000-8000-000000000000", codes("ABCDEF")));
    expect(result).toEqual({ ok: false, error: "ACCOUNT_NOT_FOUND" });
    expect(await counts()).toEqual({ lobbies: 0, members: 0 });
  });

  it("does not hide other database errors and leaves no partial room", async () => {
    const accountId = await newAccount();
    await expect(createRoomWithHost(db, input(accountId, codes("ABCDEF"), { capacity: 1 }))).rejects.toThrow();
    expect(await counts()).toEqual({ lobbies: 0, members: 0 });
  });

  it("allows a new room once the account has left its previous one", async () => {
    const accountId = await newAccount();
    await createRoomWithHost(db, input(accountId, codes("ABCDEF")));
    await pool.query("update lobby_members set left_at = now()");
    expect(await createRoomWithHost(db, input(accountId, codes("BCDEFG")))).toMatchObject({ ok: true });
  });
});
