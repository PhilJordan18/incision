import { execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { createDatabase, createRoomWithHost, joinRoomByCode } from "@incision/database";
import { runMigrations } from "@incision/database/migrations";
import { roomWatchAckSchema } from "../../../apps/web/src/rooms/protocol";
import { raceStartAckSchema } from "../../../apps/web/src/races/protocol";
import { Client, waitFor } from "./client";
import { config, databaseName } from "./config";
import { assertCoverage, summary } from "./metrics";
import { app, root, start, stop } from "./local-server";

async function main() {
  const settings = config(process.env);
  const name = databaseName(`incision_load_${Date.now()}_${randomBytes(6).toString("hex")}`);
  const url = new URL(settings.admin);
  url.pathname = `/${name}`;
  const secret = randomBytes(32).toString("base64url");
  const admin = new pg.Client({ connectionString: settings.admin, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  const pool = new pg.Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  const controller = new AbortController();
  const abort = () => controller.abort();
  pool.on("error", abort);
  admin.on("error", abort);
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const deadline = setTimeout(abort, 180_000);
  let created = false;
  let connected = false;
  let server: Awaited<ReturnType<typeof start>> | undefined;
  const clients: Client[] = [];
  const started = performance.now();
  const metadata = {
    timestamp: new Date().toISOString(),
    sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "",
    node: process.version,
    machine: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, memoryGiB: os.totalmem() / 2 ** 30, loadBefore: os.loadavg() },
    runners: settings.runners, spectators: settings.spectators,
    fixtureSetup: "Synthetic accounts and signed local sessions; real DB membership functions, not HTTP sign-in/admission load",
    scenario: "One full fixed public-domain FR race, mandatory correction, correct inserts, one per 125–153 ms plus ACK delay",
    visualSmoothness: "NOT_CHECKED",
    productionCapacity: "NOT_CHECKED",
  };
  let report: object = { ...metadata, passed: false };
  let failed = true;
  let stage = "database setup";
  const cleanupErrors: string[] = [];
  try {
    await admin.connect();
    connected = true;
    // Never drop an existing database. A collision is an error, not a reason to overwrite.
    await admin.query(`create database "${name}"`);
    created = true;
    await runMigrations({ connectionString: url.toString(), lockWaitMs: 5_000, lockTimeoutMs: 5_000, statementTimeoutMs: 15_000 });
    stage = "account and membership fixtures";
    const db = createDatabase(pool);
    const accounts: { id: string; cookie: string }[] = [];
    for (let i = 0; i < settings.runners + settings.spectators; i++) {
      controller.signal.throwIfAborted();
      const row = (await pool.query<{ id: string; session_version: number }>(
        "insert into accounts (login, login_canonical, display_name) values ($1,$1,$2) returning id, session_version",
        [`load${i}`, `Load ${i}`],
      )).rows[0];
      if (!row) throw new Error("Fixture account missing");
      const token = await encode({ token: { sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) }, secret, salt: "authjs.session-token" });
      accounts.push({ id: row.id, cookie: `authjs.session-token=${token}` });
    }
    const host = accounts[0]!;
    const room = await createRoomWithHost(db, { accountId: host.id, role: "participant", visibility: "code", capacity: 30, randomIndex: randomInt });
    if (!room.ok) throw new Error("Fixture room creation refused");
    for (let i = 1; i < accounts.length; i++) {
      const joined = await joinRoomByCode(db, { accountId: accounts[i]!.id, code: room.room.code, role: i < settings.runners ? "participant" : "spectator" });
      if (!joined.ok) throw new Error(`Fixture admission ${i}: ${joined.error}`);
    }
    stage = "server startup";
    server = await start({ port: settings.port, database: url.toString(), secret }, controller.signal);
    stage = "socket connections and room watch";
    for (let i = 0; i < accounts.length; i++) {
      const client = new Client({ origin: server.origin, cookie: accounts[i]!.cookie, spectator: i >= settings.runners, expectedRunners: settings.runners }, controller.signal);
      clients.push(client);
      await client.connect();
      const ack = roomWatchAckSchema.parse(await client.ask("room:watch", { code: room.room.code }));
      if (!ack.ok) throw new Error(`Room watch ${i} refused`);
    }
    console.log("Connected: 30 runners and 20 spectators. Starting the real race.");
    stage = "race start";
    const startAck = raceStartAckSchema.parse(await clients[0]!.ask("race:start", {}));
    if (!startAck.ok) throw new Error(`Race start refused: ${startAck.error}`);
    stage = "typing and acknowledgements";
    const typing = clients.slice(0, settings.runners).map((client, index) => client.type(index));
    try { await Promise.all(typing); }
    catch (error) {
      controller.abort();
      await Promise.allSettled(typing);
      throw error;
    }
    stage = "committed results";
    const raceId = clients[0]!.reveal!.reveal.raceId;
    await waitFor(() => clients.every((client) => client.terminal && client.resultsPublished), controller.signal);
    // Publication of results is a committed room snapshot, not just the in-memory ended event.
    const snapshots = await Promise.all(clients.map(async (client) => {
      const ack = roomWatchAckSchema.parse(await client.ask("room:watch", { code: room.room.code }));
      if (!ack.ok) throw new Error("Final room watch refused");
      return ack.snapshot;
    }));
    if (snapshots.some((snapshot) => snapshot.phase !== "results")) throw new Error("Results not committed yet");
    const results = await pool.query<{ outcome: string; count: string }>(
      "select outcome, count(*) from race_results where race_id = $1 group by outcome", [raceId],
    );
    const stored = results.rows.reduce((total, row) => total + Number(row.count), 0);
    const finished = Number(results.rows.find((row) => row.outcome === "finished")?.count ?? 0);
    const observing = clients.slice(settings.runners).filter((client) => client.progressCount > 0 && client.terminal && client.reveal?.selfEntrantId === null).length;
    const acknowledged = clients.reduce((total, client) => total + client.acknowledged, 0);
    const expected = clients.slice(0, settings.runners).reduce((total, client) => total + (client.reveal?.reveal.text.length ?? 0), 0);
    const errors = clients.reduce((total, client) => total + client.errors, 0);
    const disconnects = clients.reduce((total, client) => total + client.disconnects, 0);
    const coverage = { runners: settings.runners, spectators: settings.spectators, finished, stored, observing, acknowledged, expected, errors, disconnects };
    assertCoverage(coverage);
    report = {
      ...metadata, passed: true, coverage,
      buildId: (await readFile(path.join(app, ".next/BUILD_ID"), "utf8")).trim(),
      durationMs: performance.now() - started, loadAfter: os.loadavg(),
      batchAckRttMs: summary(clients.flatMap((client) => client.batchLatency.values)),
      spectatorBroadcastGapMs: summary(clients.slice(settings.runners).flatMap((client) => client.broadcastGaps.values)),
      clients: clients.map((client, index) => ({
        index, role: index < settings.runners ? "runner" : "spectator",
        acknowledged: client.acknowledged, progressCount: client.progressCount,
        terminal: client.terminal, errors: client.errors, disconnects: client.disconnects,
        batchAckRttMs: client.batchLatency.report(), racingBroadcastGapMs: client.broadcastGaps.report(),
      })),
    };
    failed = false;
  } catch (error) {
    // Never serialize raw driver/server errors: they may contain a connection string or cookie.
    report = { ...metadata, passed: false, failure: error instanceof Error ? error.name : "UnknownError",
      stage,
      coverage: clients.map((client, index) => ({ index, acknowledged: client.acknowledged, progressCount: client.progressCount, terminal: client.terminal, errors: client.errors, disconnects: client.disconnects })),
    };
    console.error("Load run failed; see the sanitized report (no raw secrets logged).");
  } finally {
    controller.abort();
    clients.forEach((client) => client.close());
    if (server) await stop(server.child).catch(() => cleanupErrors.push("server stop"));
    await pool.end().catch(() => cleanupErrors.push("pool close"));
    if (created) await admin.query(`drop database "${name}" with (force)`).catch(() => cleanupErrors.push(`database retained: ${name}`));
    if (connected) await admin.end().catch(() => cleanupErrors.push("admin close"));
    clearTimeout(deadline);
    process.removeListener("SIGINT", abort);
    process.removeListener("SIGTERM", abort);
  }
  const output = path.resolve(import.meta.dirname, "../results");
  await mkdir(output, { recursive: true });
  const file = path.join(output, `${name}.json`);
  await writeFile(file, `${JSON.stringify({ ...report, cleanupErrors }, null, 2)}\n`, { flag: "wx" });
  console.log(`Load report: ${file}`);
  if (failed || cleanupErrors.length > 0) process.exitCode = 1;
}

main().catch(() => {
  console.error("Load harness refused or could not finish. Check local-only confirmation, database, build and port.");
  process.exitCode = 1;
});
