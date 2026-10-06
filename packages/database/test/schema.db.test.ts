import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../src/migrations";
import { createTemporaryDatabase, type TemporaryDatabase } from "./test-database";

let database: TemporaryDatabase;
let client: pg.Client;

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

/** Runs a statement inside a savepoint and returns the violated constraint, if any. */
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
    expect(await violation("insert into accounts (display_name, password_hash) values ('X', 'hash')")).toBe("accounts_password_requires_login");
    expect(await violation("insert into accounts (login, display_name) values ('alice', 'X')")).toBe("accounts_login_pair");
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
  it.each([
    ["ABC0EF", "lobbies_code_format"],
    ["abcdef", "lobbies_code_format"],
    ["ABCDE", "lobbies_code_format"],
  ])("rejects the code %s", async (code, constraint) => {
    expect(await violation("insert into lobbies (code, capacity) values ($1, 4)", [code])).toBe(constraint);
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

  it("keeps the closing date consistent with the closed phase", async () => {
    expect(await violation("insert into lobbies (code, capacity, phase) values ('CXSD23', 4, 'closed')")).toBe("lobbies_closed_at_matches_phase");
  });
});
