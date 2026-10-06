import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let client: pg.Client;

/** Shaped like hashPassword's output (the database checks the shape, not the cryptography). */
const WELL_FORMED_HASH = `scrypt$15$8$3$${"A".repeat(22)}$${"A".repeat(43)}`;

beforeAll(async () => {
  database = await createTemporaryDatabase();
  await runMigrations({ connectionString: database.url });
  client = new pg.Client({ connectionString: database.url });
  await client.connect();
});

afterAll(async () => {
  await client.end();
  await database.drop();
});

/** Runs a statement in a transaction that is always rolled back; returns the violated constraint, if any. */
async function violation(sql: string, values: unknown[] = []): Promise<string | undefined> {
  await client.query("begin");
  try {
    await client.query(sql, values);
    return undefined;
  } catch (error: unknown) {
    return error instanceof pg.DatabaseError ? error.constraint : String(error);
  } finally {
    await client.query("rollback");
  }
}

async function account(displayName: string): Promise<string> {
  const result = await client.query<{ id: string }>("insert into accounts (display_name) values ($1) returning id", [displayName]);
  const id = result.rows[0]?.id;
  if (!id) throw new Error("no account id");
  return id;
}

async function lobbyWithMember(code: string, accountId: string): Promise<{ lobbyId: string; memberId: string }> {
  const lobby = await client.query<{ id: string }>("insert into lobbies (code, capacity) values ($1, 4) returning id", [code]);
  const lobbyId = lobby.rows[0]?.id ?? "";
  const member = await client.query<{ id: string }>(
    "insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical) values ($1, $2, 'participant', 'Host', 'host') returning id",
    [lobbyId, accountId],
  );
  return { lobbyId, memberId: member.rows[0]?.id ?? "" };
}

describe("accounts", () => {
  it("keeps one account per login, whatever its case", async () => {
    await client.query("insert into accounts (login, login_canonical, display_name) values ('bob', 'bob', 'Bob')");
    expect(await violation("insert into accounts (login, login_canonical, display_name) values ('BOB', 'bob', 'Other')")).toBe(
      "accounts_login_canonical_unique",
    );
  });

  it.each([
    ["Bob", "BOB"],
    ["Bob", "bob2"],
    ["bad login", "bad login"],
    ["ab", "ab"],
  ])("rejects login %j with canonical %j", async (login, canonical) => {
    expect(await violation("insert into accounts (login, login_canonical, display_name) values ($1, $2, 'X')", [login, canonical])).toBe(
      "accounts_login_format",
    );
  });

  it("requires a local login for a password and both login columns together", async () => {
    expect(await violation("insert into accounts (display_name, password_hash) values ('X', $1)", [WELL_FORMED_HASH])).toBe(
      "accounts_password_requires_login",
    );
    expect(await violation("insert into accounts (login, display_name) values ('alice', 'X')")).toBe("accounts_login_pair");
  });

  it("rejects a blank display name and an empty password hash", async () => {
    expect(await violation("insert into accounts (display_name) values ('   ')")).toBe("accounts_display_name_length");
    // Both the format and the not-empty checks refuse it; PostgreSQL reports them by name order.
    expect(await violation("insert into accounts (login, login_canonical, display_name, password_hash) values ('carol', 'carol', 'Carol', '')")).toBe(
      "accounts_password_hash_format",
    );
  });

  it("accepts only password hashes shaped like hashPassword's output", async () => {
    await client.query("insert into accounts (login, login_canonical, display_name, password_hash) values ('dave', 'dave', 'Dave', $1)", [
      WELL_FORMED_HASH,
    ]);
    for (const hash of ["hunter2", `${WELL_FORMED_HASH}x`, WELL_FORMED_HASH.replace("scrypt$", "bcrypt$"), `x${WELL_FORMED_HASH}`]) {
      expect(await violation("insert into accounts (login, login_canonical, display_name, password_hash) values ('erin', 'erin', 'Erin', $1)", [hash])).toBe(
        "accounts_password_hash_format",
      );
    }
  });

  it("starts session versions at 1, also for rows inserted without the column, and refuses 0", async () => {
    const accountId = await account("Frank");
    const [row] = (await client.query<{ session_version: number }>("select session_version from accounts where id = $1", [accountId])).rows;
    expect(row?.session_version).toBe(1);
    expect(await violation("update accounts set session_version = 0 where id = $1", [accountId])).toBe("accounts_session_version_positive");
  });

  it("deletes an account's provider identities with it, but not an account with room memberships", async () => {
    const accountId = await account("Leaver");
    await client.query("insert into oauth_identities (account_id, provider, provider_subject) values ($1, 'discord', 'd-1')", [accountId]);
    await client.query("delete from accounts where id = $1", [accountId]);
    expect((await client.query("select 1 from oauth_identities where provider_subject = 'd-1'")).rowCount).toBe(0);

    const member = await account("Member");
    await lobbyWithMember("MBRS23", member);
    expect(await violation("delete from accounts where id = $1", [member])).toBe("lobby_members_account_id_accounts_id_fk");
  });

  it("refuses the same provider identity twice and two identities of one provider per account", async () => {
    const first = await account("First");
    const second = await account("Second");
    await client.query("insert into oauth_identities (account_id, provider, provider_subject) values ($1, 'github', '42')", [first]);
    expect(await violation("insert into oauth_identities (account_id, provider, provider_subject) values ($1, 'github', '42')", [second])).toBe("oauth_identities_provider_subject_unique");
    expect(await violation("insert into oauth_identities (account_id, provider, provider_subject) values ($1, 'github', '43')", [first])).toBe("oauth_identities_account_provider_unique");
  });
});

describe("lobbies and members", () => {
  it("accepts every character of the domain alphabet", async () => {
    for (const code of ["ABCDEF", "GHJKMN", "PQRSTU", "VWXYZ2", "345678", "9ABCDE"]) {
      expect(await violation("insert into lobbies (code, capacity) values ($1, 4)", [code])).toBeUndefined();
    }
  });

  it.each(["ABC0EF", "ABCOEF", "ABC1EF", "ABCIEF", "ABCLEF", "abcdef", "ABCDE", "ABCDEFG"])("rejects the code %s", async (code) => {
    expect(await violation("insert into lobbies (code, capacity) values ($1, 4)", [code])).toBe("lobbies_code_format");
  });

  it("rejects a duplicate code and a capacity outside 2..30", async () => {
    await client.query("insert into lobbies (code, capacity) values ('DUPE23', 4)");
    expect(await violation("insert into lobbies (code, capacity) values ('DUPE23', 4)")).toBe("lobbies_code_unique");
    expect(await violation("insert into lobbies (code, capacity) values ('CAPA23', 1)")).toBe("lobbies_capacity_range");
    expect(await violation("insert into lobbies (code, capacity) values ('CAPB23', 31)")).toBe("lobbies_capacity_range");
  });

  it("allows one active room per account, and a new one after leaving", async () => {
    const accountId = await account("Mover");
    const { memberId } = await lobbyWithMember("MVRS23", accountId);
    const other = await client.query<{ id: string }>("insert into lobbies (code, capacity) values ('MVRS24', 4) returning id");
    const join = "insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical) values ($1, $2, 'spectator', 'Mover', 'mover')";
    expect(await violation(join, [other.rows[0]?.id, accountId])).toBe("lobby_members_active_account_unique");
    await client.query("update lobby_members set left_at = now() where id = $1", [memberId]);
    expect(await violation(join, [other.rows[0]?.id, accountId])).toBeUndefined();
  });

  it("refuses a host who is a member of another room", async () => {
    const first = await lobbyWithMember("HSTA23", await account("Host A"));
    const second = await lobbyWithMember("HSTB23", await account("Host B"));
    expect(await violation("update lobbies set host_member_id = $1 where id = $2", [second.memberId, first.lobbyId])).toBe("lobbies_host_member_fk");
  });

  it("refuses to delete a hosting member but cascades when the room is deleted", async () => {
    const { lobbyId, memberId } = await lobbyWithMember("DXTE23", await account("Deleter"));
    await client.query("update lobbies set host_member_id = $1 where id = $2", [memberId, lobbyId]);
    expect(await violation("delete from lobby_members where id = $1", [memberId])).toBe("lobbies_host_member_fk");
    await client.query("delete from lobbies where id = $1", [lobbyId]);
    const members = await client.query("select 1 from lobby_members where id = $1", [memberId]);
    expect(members.rowCount).toBe(0);
  });

  it("keeps the closing date consistent with the closed phase, both ways", async () => {
    expect(await violation("insert into lobbies (code, capacity, phase) values ('CXSD23', 4, 'closed')")).toBe("lobbies_closed_at_matches_phase");
    expect(await violation("insert into lobbies (code, capacity, closed_at) values ('CXSD24', 4, now())")).toBe("lobbies_closed_at_matches_phase");
  });

  it("keeps active display names unique per room, not across rooms or after leaving", async () => {
    const first = await lobbyWithMember("NAME23", await account("Host N1"));
    const empty = await client.query<{ id: string }>("insert into lobbies (code, capacity) values ('NAME24', 4) returning id");
    const join = "insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical) values ($1, $2, 'participant', 'Host', 'host')";
    expect(await violation(join, [first.lobbyId, await account("Twin")])).toBe("lobby_members_active_display_name_unique");
    expect(await violation(join, [empty.rows[0]?.id, await account("Elsewhere")])).toBeUndefined();
    await client.query("update lobby_members set left_at = now() where id = $1", [first.memberId]);
    expect(await violation(join, [first.lobbyId, await account("After")])).toBeUndefined();
  });

  it("bounds member display names to 1..40 visible characters", async () => {
    const { lobbyId } = await lobbyWithMember("SZXE23", await account("Sizer"));
    const join = "insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical) values ($1, $2, 'participant', $3, 'x')";
    expect(await violation(join, [lobbyId, await account("Blank"), "  "])).toBe("lobby_members_display_name_length");
    expect(await violation(join, [lobbyId, await account("Long"), "a".repeat(41)])).toBe("lobby_members_display_name_length");
  });
});
