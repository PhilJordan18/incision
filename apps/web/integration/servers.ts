import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { isLocalDatabase } from "@incision/database";
import { runMigrations } from "@incision/database/migrations";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { io, type Socket } from "socket.io-client";

/**
 * Integration harness (F-04.0): the production build of the custom server, started as real
 * processes against one disposable local database, driven over Socket.IO like a page would.
 * Nothing here bypasses a check: sessions are cookies encrypted with the processes' secret,
 * memberships are rows written by the same database functions as the server actions.
 */
export const DATABASE_URL = process.env.INTEGRATION_DATABASE_URL ?? "postgresql://incision_test:incision_test_only@localhost:5433/incision_e2e_a7";
export const PORTS = (process.env.INTEGRATION_PORTS ?? "3856,3857").split(",").map(Number);
export const SECRET = randomBytes(32).toString("base64url");
const SESSION_COOKIE = "authjs.session-token";
const APP_DIR = path.resolve(import.meta.dirname, "..");

export async function prepareDatabase(): Promise<void> {
  const url = new URL(DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!isLocalDatabase(url.toString()) || !/^incision_e2e\w*$/.test(name)) {
    throw new Error("INTEGRATION_DATABASE_URL must name a local incision_e2e* database: it is dropped at every run");
  }
  const server = new URL(url);
  server.pathname = "/postgres";
  const admin = new pg.Client({ connectionString: server.toString() });
  await admin.connect();
  try {
    await admin.query(`drop database if exists "${name}" with (force)`);
    await admin.query(`create database "${name}"`);
  } finally {
    await admin.end();
  }
  await runMigrations({ connectionString: url.toString() });
}

/** One server process. `origin` is the URL its pages and sockets use. */
export type ServerProcess = {
  readonly origin: string;
  readonly child: ChildProcess;
  readonly output: () => string;
  /** Resolves with the exit code once the process has exited. */
  readonly exited: Promise<number | null>;
};

export async function startServer(port: number): Promise<ServerProcess> {
  const origin = `http://localhost:${port}`;
  let output = "";
  const child = spawn(process.execPath, ["--import", "tsx", "server.ts"], {
    cwd: APP_DIR,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      APP_URL: origin,
      AUTH_URL: origin,
      AUTH_SECRET: SECRET,
      DATABASE_URL,
      TRUSTED_PROXY_HOPS: "0",
      AUTH_GITHUB_ID: "integration-github-client-id",
      AUTH_GITHUB_SECRET: "integration-placeholder-not-a-secret",
      AUTH_DISCORD_ID: "integration-discord-client-id",
      AUTH_DISCORD_SECRET: "integration-placeholder-not-a-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  child.stderr?.on("data", (chunk: Buffer) => (output += chunk.toString()));
  const exited = new Promise<number | null>((resolve) => child.once("exit", (code) => resolve(code)));
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      if ((await fetch(`${origin}/api/health/live`)).ok) {
        return { origin, child, output: () => output, exited };
      }
    } catch {
      // Not listening yet.
    }
    if (child.exitCode !== null) {
      break;
    }
    await sleep(500);
  }
  child.kill("SIGKILL");
  throw new Error(`server on ${port} did not start:\n${output}`);
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Runs statements on the shared database (fixtures and checks only). */
export async function query<Row extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<Row>(sql, values)).rows;
  } finally {
    await client.end();
  }
}

/** An account and the session cookie a sign-in would have given it. */
export async function account(login: string, displayName = login): Promise<{ readonly id: string; readonly cookie: string }> {
  // No password: the session cookie below is what a sign-in would have set.
  const [row] = await query<{ id: string; session_version: number }>(
    "insert into accounts (login, login_canonical, display_name) values ($1, lower($1), $2) returning id, session_version",
    [login, displayName],
  );
  if (row === undefined) {
    throw new Error("no account");
  }
  const token = await encode({ token: { sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) }, secret: SECRET, salt: SESSION_COOKIE });
  return { id: row.id, cookie: `${SESSION_COOKIE}=${token}` };
}

/** A tab: a socket with the account's cookie, and every message it received, in order. */
export type Tab = {
  readonly socket: Socket;
  readonly received: { readonly event: string; readonly payload: unknown }[];
  readonly next: (event: string, matching?: (payload: never) => boolean, timeoutMs?: number) => Promise<unknown>;
  readonly ask: (event: string, payload: unknown) => Promise<unknown>;
};

export async function openTab(origin: string, cookie: string): Promise<Tab> {
  const socket = io(origin, { transports: ["websocket"], reconnection: false, extraHeaders: { origin, cookie } });
  const received: Tab["received"] = [];
  socket.onAny((event: string, payload: unknown) => received.push({ event, payload }));
  await new Promise<void>((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
  return {
    socket,
    received,
    next: (event, matching = () => true, timeoutMs = 10_000) =>
      new Promise((resolve, reject) => {
        const already = received.find((message) => message.event === event && matching(message.payload as never));
        if (already !== undefined) {
          resolve(already.payload);
          return;
        }
        const timer = setTimeout(() => {
          socket.off(event, listener);
          reject(new Error(`no ${event} within ${timeoutMs} ms`));
        }, timeoutMs);
        const listener = (payload: unknown) => {
          if (matching(payload as never)) {
            clearTimeout(timer);
            socket.off(event, listener);
            resolve(payload);
          }
        };
        socket.on(event, listener);
      }),
    ask: (event, payload) => socket.timeout(10_000).emitWithAck(event, payload),
  };
}
