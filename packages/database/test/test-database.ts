import { randomBytes } from "node:crypto";
import pg from "pg";
import { parse } from "pg-connection-string";

const TEMPORARY_NAME = /^incision_test_[0-9a-f]{12}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
/** How long a drop waits for the test's own connections to finish closing. */
const DROP_WAIT_MS = 5_000;
const DROP_POLL_MS = 25;

export type TemporaryDatabase = { readonly url: string; readonly drop: () => Promise<void> };

/**
 * Server used by database tests. Only an explicit local or CI server is accepted: these
 * tests create and drop databases, so there is no fallback to DATABASE_URL or Neon.
 */
function testServerUrl(): URL {
  return localTestServerUrl(process.env.TEST_DATABASE_URL);
}

/**
 * Judged with pg's own parser: query parameters such as `?host=` override the URL's host
 * for pg, so they are refused instead of being trusted.
 */
export function localTestServerUrl(raw: string | undefined): URL {
  if (!raw) {
    throw new Error("TEST_DATABASE_URL is required (a disposable local or CI PostgreSQL, see docs/SETUP.md)");
  }
  const url = new URL(raw);
  const overrides = ["host", "hostaddr", "port"].filter((name) => url.searchParams.has(name));
  if (overrides.length > 0 || !LOCAL_HOSTS.has(parse(raw).host ?? "")) {
    throw new Error("TEST_DATABASE_URL must point to localhost: database tests create and drop databases");
  }
  return url;
}

async function withServer<T>(action: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: testServerUrl().toString() });
  await client.connect();
  try {
    return await action(client);
  } finally {
    await client.end();
  }
}

export async function createTemporaryDatabase(): Promise<TemporaryDatabase> {
  const name = `incision_test_${randomBytes(6).toString("hex")}`;
  await withServer((client) => client.query(`create database "${name}"`));
  const url = testServerUrl();
  url.pathname = `/${name}`;
  return {
    url: url.toString(),
    drop: async () => {
      if (!TEMPORARY_NAME.test(name)) {
        throw new Error("Refusing to drop a database that this helper did not create");
      }
      await withServer(async (client) => {
        // pg's Pool.end() resolves before its sockets close: a forced drop would kill those
        // closing sessions, and pg would raise their 57P01 as an unhandled error. Wait for them
        // first (bounded); the forced drop still ends any session a test left open.
        for (let waited = 0; waited < DROP_WAIT_MS; waited += DROP_POLL_MS) {
          const { rows } = await client.query<{ n: number }>(
            "select count(*)::int as n from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()", [name]);
          if (rows[0]?.n === 0) break;
          await new Promise((resolve) => setTimeout(resolve, DROP_POLL_MS));
        }
        await client.query(`drop database if exists "${name}" with (force)`);
      });
    },
  };
}
