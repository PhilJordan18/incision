import { randomBytes } from "node:crypto";
import pg from "pg";

const TEMPORARY_NAME = /^incision_test_[0-9a-f]{12}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type TemporaryDatabase = { readonly url: string; readonly drop: () => Promise<void> };

/**
 * Server used by database tests. Only an explicit local or CI server is accepted: these
 * tests create and drop databases, so there is no fallback to DATABASE_URL or Neon.
 */
function testServerUrl(): URL {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) {
    throw new Error("TEST_DATABASE_URL is required (a disposable local or CI PostgreSQL, see docs/SETUP.md)");
  }
  const url = new URL(raw);
  if (!LOCAL_HOSTS.has(url.hostname)) {
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
      await withServer((client) => client.query(`drop database if exists "${name}" with (force)`));
    },
  };
}
