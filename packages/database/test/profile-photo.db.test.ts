import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabase, type Database } from "../src/client";
import { readProfilePhoto, readProfilePhotoRevision, saveProfilePhoto } from "../src/identity/photos";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let temporary: TemporaryDatabase;
let pool: pg.Pool;
let db: Database;
// Storage-contract fixture only: image decoding is tested in the web adapter, not in SQL.
const bytes = Buffer.from("RIFF0000WEBPstorage-fixture");
beforeAll(async () => {
  temporary = await createTemporaryDatabase();
  await runMigrations({ connectionString: temporary.url });
  pool = new pg.Pool({ connectionString: temporary.url }); db = createDatabase(pool);
});
afterAll(async () => { await pool?.end(); await temporary?.drop(); });

async function account() {
  const result = await pool.query<{ id: string }>("insert into accounts(display_name) values ('Photo test') returning id");
  return result.rows[0]!.id;
}

describe("profile photo persistence", () => {
  it("round-trips bytes, replaces only its account photo, and leaves identity/session untouched", async () => {
    const one = await account(); const two = await account();
    const before = (await pool.query("select * from accounts order by id")).rows;
    expect(await readProfilePhoto(db, one)).toBeUndefined();
    expect(await saveProfilePhoto(db, { accountId: one, webp: bytes })).toBe(true);
    const revision = await readProfilePhotoRevision(db, one);
    expect(revision).toBeTypeOf("string");
    expect(await readProfilePhoto(db, one)).toEqual(bytes);
    expect(await saveProfilePhoto(db, { accountId: one, webp: Buffer.concat([bytes, Buffer.from("replacement")]) })).toBe(true);
    expect(await readProfilePhotoRevision(db, one)).not.toBe(revision);
    expect(await readProfilePhoto(db, two)).toBeUndefined();
    expect((await pool.query("select * from accounts order by id")).rows).toEqual(before);
  });

  it("rejects oversized/invalid storage and missing accounts without changing the previous image", async () => {
    const id = await account();
    await saveProfilePhoto(db, { accountId: id, webp: bytes });
    for (const invalid of [Buffer.alloc(0), Buffer.from("not an image"), Buffer.concat([bytes, Buffer.alloc(262144)])]) {
      await expect(saveProfilePhoto(db, { accountId: id, webp: invalid })).rejects.toThrow();
      expect(await readProfilePhoto(db, id)).toEqual(bytes);
    }
    await expect(saveProfilePhoto(db, { accountId: "00000000-0000-4000-8000-000000000001", webp: bytes })).rejects.toThrow();
  });

  it("keeps one row across concurrent replacements and cascades account deletion", async () => {
    const id = await account();
    const second = Buffer.concat([bytes, Buffer.from("other")]);
    await Promise.all([saveProfilePhoto(db, { accountId: id, webp: bytes }), saveProfilePhoto(db, { accountId: id, webp: second })]);
    const rows = (await pool.query("select webp from profile_photos where account_id = $1", [id])).rows;
    expect(rows).toHaveLength(1);
    expect([bytes, second]).toContainEqual(rows[0].webp);
    await pool.query("delete from accounts where id = $1", [id]);
    expect(await readProfilePhoto(db, id)).toBeUndefined();
  });
});
