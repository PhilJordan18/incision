import { execFileSync } from "node:child_process";
import { randomBytes, randomInt } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import pg from "pg";
import { encode } from "next-auth/jwt";
import { createDatabase, createGuestSession, createRoomWithHost, joinRoomByCode, joinRoomByCodeAsGuest } from "@incision/database";
import { runMigrations } from "@incision/database/migrations";
import { importCorpus } from "../../../packages/database/src/corpus/import";
import { roomWatchAckSchema } from "../../../apps/web/src/rooms/protocol";
import { raceStartAckSchema } from "../../../apps/web/src/races/protocol";
import { issueGuestCookie, guestCookieName } from "../../../apps/web/src/server/identity/guest-cookie";
import { GUEST_COMMAND_LIMIT } from "../../../apps/web/src/server/realtime/guest-command-gate";
import { readSqlCounters, sqlDelta } from "./sql-counters";
import { Client, waitFor } from "./client";
import { config, databaseName } from "./config";
import { assertCoverage, summary } from "./metrics";
import { app, root, start, stop } from "./local-server";
import { LOAD_CORPUS_VERSION, readLoadCorpus } from "./corpus";
import { openBrowser, type BrowserReport } from "./browser";

async function main() {
  const settings = config(process.env);
  const name = databaseName(`incision_load_${Date.now()}_${randomBytes(6).toString("hex")}`);
  const url = new URL(settings.admin);
  url.pathname = `/${name}`;
  const secret = randomBytes(32).toString("base64url");
  const guestKey = settings.guestArcade ? randomBytes(32).toString("base64url") : undefined;
  const guests = settings.guestArcade ? 15 : 0;
  const admin = new pg.Client({ connectionString: settings.admin, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  const pool = new pg.Pool({ connectionString: url.toString(), max: 5, connectionTimeoutMillis: 5_000, query_timeout: 15_000 });
  const controller = new AbortController();
  const abort = () => controller.abort();
  pool.on("error", abort);
  admin.on("error", abort);
  process.once("SIGINT", abort);
  process.once("SIGTERM", abort);
  const deadline = setTimeout(abort, 180_000).unref();
  let created = false;
  let connected = false;
  let server: Awaited<ReturnType<typeof start>> | undefined;
  let browser: Awaited<ReturnType<typeof openBrowser>> | undefined;
  const clients: Client[] = [];
  const started = performance.now();
  const metadata = {
    timestamp: new Date().toISOString(),
    sha: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
    dirty: execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim() !== "",
    node: process.version,
    machine: { platform: process.platform, arch: process.arch, cpus: os.cpus().length, cpu: os.cpus()[0]?.model, memoryGiB: os.totalmem() / 2 ** 30, loadBefore: os.loadavg() },
    runners: settings.runners, spectators: settings.spectators, guests, arcade: settings.guestArcade,
    expectedSocketConnections: settings.browser ? 51 : 50,
    fixtureSetup: "Synthetic identities and signed local sessions; real DB membership functions, not HTTP sign-in/admission load",
    scenario: "One full FR race drawn from the versioned corpus with default settings, mandatory correction, correct inserts, one per 125–153 ms plus ACK delay",
    corpusVersion: LOAD_CORPUS_VERSION,
    visualSmoothness: "NOT_CHECKED",
    productionCapacity: "NOT_CHECKED",
  };
  let report: object = { ...metadata, passed: false };
  let failed = true;
  let stage = "database setup";
  let startRefusal: string | undefined;
  let browserReport: BrowserReport | undefined;
  let guestArcade: {
    guestResults: number; arcadeRunners: number; fogObservers: number;
    measurements: ReturnType<typeof sqlDelta>; guestSqlBudget: number; durationMs: number;
  } | undefined;
  const cleanupErrors: string[] = [];
  try {
    await admin.connect();
    connected = true;
    // Never drop an existing database. A collision is an error, not a reason to overwrite.
    await admin.query(`create database "${name}"`);
    created = true;
    await runMigrations({ connectionString: url.toString(), lockWaitMs: 5_000, lockTimeoutMs: 5_000, statementTimeoutMs: 15_000 });
    stage = "corpus import";
    const db = createDatabase(pool);
    const corpus = await readLoadCorpus();
    const imported = await importCorpus(db, corpus);
    if (!imported.ok || !imported.report.active) throw new Error("Load corpus import refused or inactive");
    stage = "account and membership fixtures";
    const accounts: { id: string; cookie: string }[] = [];
    for (let i = 0; i < settings.runners + settings.spectators - guests; i++) {
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
    const accountRunners = settings.runners - guests;
    const cookies = accounts.slice(0, accountRunners).map(account => account.cookie);
    for (let i = 1; i < accounts.length; i++) {
      const joined = await joinRoomByCode(db, { accountId: accounts[i]!.id, code: room.room.code, role: i < accountRunners ? "participant" : "spectator" });
      if (!joined.ok) throw new Error(`Fixture admission ${i}: ${joined.error}`);
    }
    if (guestKey !== undefined) {
      await pool.query("update lobby_settings set bonuses_enabled = true where lobby_id = $1", [room.room.id]);
      for (let i = 0; i < guests; i++) {
        const { value, credential } = issueGuestCookie(guestKey);
        await createGuestSession(db, credential);
        const joined = await joinRoomByCodeAsGuest(db, { proof: credential, code: room.room.code, role: "participant", nickname: `Visitor ${i}` });
        if (!joined.ok) throw new Error(`Guest fixture admission ${i}: ${joined.error}`);
        cookies.push(`${guestCookieName(false)}=${value}`);
      }
      stage = "SQL instrumentation";
      await pool.query("create extension pg_stat_statements");
      await readSqlCounters(pool);
    }
    cookies.push(...accounts.slice(accountRunners).map(account => account.cookie));
    stage = "server startup";
    server = await start({ port: settings.port, database: url.toString(), secret, guestKey }, controller.signal);
    stage = "socket connections and room watch";
    for (const [i, cookie] of cookies.entries()) {
      const client = new Client({ origin: server.origin, cookie, spectator: i >= settings.runners, expectedRunners: settings.runners }, controller.signal);
      clients.push(client);
      await client.connect();
      const ack = roomWatchAckSchema.parse(await client.ask("room:watch", { code: room.room.code }));
      if (!ack.ok) throw new Error(`Room watch ${i} refused`);
    }
    console.log("Connected: 30 runners and 20 spectators. Starting the real race.");
    if (settings.browser) {
      stage = "browser spectator";
      browser = await openBrowser({ origin: server.origin, cookie: accounts.at(-1)!.cookie, code: room.room.code });
    }
    stage = "race start";
    const sqlBefore = settings.guestArcade ? await readSqlCounters(pool) : undefined;
    const raceStarted = performance.now();
    const startAck = raceStartAckSchema.parse(await clients[0]!.ask("race:start", {}));
    if (!startAck.ok) {
      startRefusal = startAck.error;
      throw new Error("Race start refused");
    }
    const sampling = await browser?.sample();
    stage = "typing and acknowledgements";
    let fogClaimed = false;
    const claimFog = () => {
      if (fogClaimed) return false;
      fogClaimed = true;
      return true;
    };
    const typing = clients.slice(0, settings.runners).map((client, index) =>
      client.type(index, index >= accountRunners && guests > 0 ? claimFog : undefined));
    try { await Promise.all(typing); }
    catch (error) {
      controller.abort();
      await Promise.allSettled(typing);
      throw error;
    }
    stage = "committed results";
    const raceId = clients[0]!.reveal!.reveal.raceId;
    const provenance = await pool.query<{ version: string; passage: string }>(
      "select config_snapshot->>'corpusVersion' as version, config_snapshot->>'text' as passage from races where id = $1", [raceId],
    );
    if (provenance.rows[0]?.version !== corpus.version) throw new Error("Race did not use the imported corpus");
    await waitFor(() => clients.every((client) => client.terminal && client.resultsPublished), controller.signal);
    const measurements = sqlBefore === undefined ? undefined : sqlDelta(sqlBefore, await readSqlCounters(pool));
    const durationMs = performance.now() - raceStarted;
    // Initial grant plus the number of persistence windows spanned by the measured phase.
    const guestSqlBudget = guests * (1 + Math.ceil(durationMs / GUEST_COMMAND_LIMIT.persistEveryMs));
    const arcadeRunners = clients.slice(0, settings.runners).filter(client => client.arcadeGrants === 3).length;
    const fogObservers = clients.slice(settings.runners).filter(client => client.fogAnnouncements === 1).length;
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
    const guestResults = settings.guestArcade ? Number((await pool.query<{ count: string }>(
      "select count(*) from race_results r join race_entrants e on e.id = r.entrant_id where e.race_id = $1 and e.kind = 'guest' and r.outcome = 'finished'", [raceId],
    )).rows[0]?.count ?? 0) : 0;
    if (measurements !== undefined) {
      stage = "guest SQL and Arcade coverage";
      guestArcade = { guestResults, arcadeRunners, fogObservers, measurements, guestSqlBudget, durationMs };
      if (guestResults !== guests || arcadeRunners !== settings.runners || fogObservers !== settings.spectators ||
          measurements.guestSessionLocks < guests || measurements.guestActivityWrites < guests ||
          measurements.guestSessionLocks > guestSqlBudget || measurements.guestActivityWrites > guestSqlBudget) {
        throw new Error("Guest SQL, persisted results or Arcade grant coverage failed");
      }
    }
    browserReport = await sampling?.finish();
    if (browserReport && !browserReport.passed) throw new Error("Browser observation failed");
    report = {
      ...metadata, passed: true, coverage,
      guestArcade,
      visualSmoothness: browserReport ? "MEASURED_LOCALLY" : "NOT_CHECKED", browser: browserReport,
      corpus: { ...imported.report, checksum: corpus.checksum, passage: provenance.rows[0].passage },
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
      stage, startRefusal, guestArcade, browser: browserReport,
      coverage: clients.map((client, index) => ({ index, acknowledged: client.acknowledged, progressCount: client.progressCount, terminal: client.terminal, errors: client.errors, disconnects: client.disconnects })),
    };
    console.error("Load run failed; see the sanitized report (no raw secrets logged).");
  } finally {
    controller.abort();
    if (browser) await browser.close().catch(() => cleanupErrors.push("browser close"));
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
  await writeFile(file, `${JSON.stringify({ ...report, passed: !failed && cleanupErrors.length === 0, cleanupErrors }, null, 2)}\n`, { flag: "wx" });
  console.log(`Load report: ${file}`);
  if (failed || cleanupErrors.length > 0) process.exitCode = 1;
}

main().catch(() => {
  console.error("Load harness refused or could not finish. Check local-only confirmation, database, build and port.");
  process.exitCode = 1;
});
