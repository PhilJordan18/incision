import { createDatabase, createRoomWithHost, joinRoomByCode } from "@incision/database";
import { parseRoomCode, ROOM_CODE_ALPHABET } from "@incision/domain";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { RaceBatchAck, RaceProgressPayload, RaceRevealPayload, RaceSelfPayload } from "../src/races/protocol";
import type { PublicRoomSnapshot } from "../src/rooms/protocol";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { account, DATABASE_URL, openTab, PORTS, prepareDatabase, query, type ServerProcess, sleep, startServer, startStallingProxy, type StallingProxy, type Tab } from "./servers";

/**
 * F-04.0 integration evidence, without a browser: real server processes (production build),
 * one disposable database, accounts driven over Socket.IO with their session cookies.
 */
const pool = { current: undefined as pg.Pool | undefined };
const servers: ServerProcess[] = [];
const tabs: Tab[] = [];
const proxies: StallingProxy[] = [];

function db() {
  if (pool.current === undefined) {
    throw new Error("no pool");
  }
  return createDatabase(pool.current);
}

beforeAll(async () => {
  await prepareDatabase();
  pool.current = new pg.Pool({ connectionString: DATABASE_URL });
}, 60_000);

afterAll(async () => {
  for (const tab of tabs) {
    tab.socket.close();
  }
  for (const proxy of proxies) {
    await proxy.close();
  }
  // Each process's output is kept with the test results (uploaded by CI on a failure).
  const logs = path.resolve(import.meta.dirname, "..", "test-results");
  await mkdir(logs, { recursive: true });
  // Every process stops first, so a failed write cannot leave one running.
  for (const server of servers) {
    server.child.kill("SIGCONT");
    server.child.kill("SIGKILL");
  }
  for (const [index, server] of servers.entries()) {
    await writeFile(path.join(logs, `integration-server-${index + 1}-${new URL(server.origin).port}.log`), server.output());
  }
  await pool.current?.end();
});

async function server(index: number): Promise<ServerProcess> {
  const started = await startServer(PORTS[index] ?? 3301 + index);
  servers.push(started);
  return started;
}

async function tab(origin: string, cookie: string, via?: string): Promise<Tab> {
  const opened = await openTab(origin, cookie, via);
  tabs.push(opened);
  return opened;
}

const FIRST_PAGE = "1c7e2a5b-3f4d-4e6a-8b9c-0d1e2f3a4b5c";
const SECOND_PAGE = "2d8f3b6c-4a5e-4f7b-9c0d-1e2f3a4b5c6d";

let codes = 0;
/** A waiting room by code, hosted by `host` (participant), joined by `guests`, through the database functions the server actions use. */
async function room(host: { id: string }, guests: { id: string }[]): Promise<string> {
  const seed = codes++;
  const created = await createRoomWithHost(db(), {
    accountId: host.id,
    role: "participant",
    visibility: "code",
    capacity: 30,
    randomIndex: (upperBound) => (seed * 7 + 3) % Math.min(upperBound, ROOM_CODE_ALPHABET.length),
  });
  if (!created.ok) {
    throw new Error(created.error);
  }
  const code = parseRoomCode(created.room.code);
  if (!code.ok) {
    throw new Error("bad code");
  }
  for (const guest of guests) {
    const joined = await joinRoomByCode(db(), { accountId: guest.id, code: code.code, role: "participant" });
    if (!joined.ok) {
      throw new Error(joined.error);
    }
  }
  return created.room.code;
}

/** Types `graphemes` from `seq` on, two per batch, below ten batches and 25 inserts a second. */
async function typeAll(page: Tab, raceId: string, graphemes: readonly string[], seq = 1): Promise<number> {
  let next = seq;
  for (let index = 0; index < graphemes.length; index += 2) {
    const events = graphemes.slice(index, index + 2).map((grapheme) => ({ type: "insert", grapheme }));
    const ack = (await page.ask("race:batch", { raceId, seq: next, textVersion: 0, events })) as RaceBatchAck;
    expect(ack, `batch ${next}`).toMatchObject({ ok: true, result: { outcome: "applied" } });
    next += 1;
    await sleep(120);
  }
  return next;
}

async function startsAt(reveal: RaceRevealPayload): Promise<void> {
  await sleep(Math.max(0, reveal.reveal.startsAt - reveal.serverNow) + 150);
}

describe("an integrated race (F-04.0)", () => {
  it("runs a race between two accounts, from the start to the stored results read again", async () => {
    const a = await server(0);
    const host = await account("int-host", "Hôte");
    const guest = await account("int-guest", "Invitée");
    const third = await account("int-late", "Tardive");
    const code = await room(host, [guest]);
    const h = await tab(a.origin, host.cookie);
    const g = await tab(a.origin, guest.cookie);
    expect(await h.ask("room:watch", { code })).toMatchObject({ ok: true });
    expect(await g.ask("room:watch", { code })).toMatchObject({ ok: true });

    expect(await g.ask("race:start", {})).toEqual({ ok: false, error: "NOT_HOST" });
    expect(await h.ask("race:start", {})).toEqual({ ok: true });
    const reveal = (await g.next("race:reveal")) as RaceRevealPayload;
    const text = reveal.reveal.text;
    // The text reached nobody before the countdown (COURSE-03), and follows the host's language.
    const beforeReveal = g.received.slice(0, g.received.findIndex((message) => message.event === "race:reveal"));
    expect(JSON.stringify(beforeReveal)).not.toContain(text.join(""));
    expect(text.join("")).toBe("Texte de test : la mer est calme, le vent se lève.");
    expect(reveal.reveal).toMatchObject({ errorMode: "mandatory", timeLimit: 120_000 });
    expect(reveal.selfEntrantId).not.toBeNull();
    await h.next("room:snapshot", (snapshot: PublicRoomSnapshot) => snapshot.phase === "countdown");

    // Nobody new during the race (SALLE-09), not even a third account with the code.
    const late = parseRoomCode(code);
    expect(late.ok && (await joinRoomByCode(db(), { accountId: third.id, code: late.code, role: "participant" }))).toMatchObject({ ok: false, error: "ROOM_NOT_ADMITTING" });

    const raceId = reveal.reveal.raceId;
    expect(await g.ask("race:batch", { raceId, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "T" }] })).toMatchObject({
      ok: true,
      result: { outcome: "refused", reason: "NOT_RACING" },
    });
    await startsAt(reveal);
    // A wrong grapheme in mandatory correction: counted, never typed, and shown blocked.
    const wrong = (await g.ask("race:batch", { raceId, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "x" }] })) as RaceBatchAck;
    expect(wrong).toMatchObject({ ok: true, result: { outcome: "applied" }, self: { snapshot: { typed: [], pendingError: true } } });
    await sleep(120);
    await Promise.all([typeAll(h, raceId, text), typeAll(g, raceId, text, 2)]);

    const results = (await h.next("room:snapshot", (snapshot: PublicRoomSnapshot) => snapshot.phase === "results", 15_000)) as PublicRoomSnapshot;
    expect(results.race).toMatchObject({ raceId, state: "finished", interruptionReason: null });
    const rows = await query<{ display_name_snapshot: string; rank: number; outcome: string; position: number; correct_inputs: string; total_inputs: string; accuracy: number }>(
      "select e.display_name_snapshot, r.rank, r.outcome, r.position, r.correct_inputs, r.total_inputs, r.accuracy from race_results r join race_entrants e on e.id = r.entrant_id where r.race_id = $1 order by r.rank",
      [raceId],
    );
    expect(rows.map((row) => [row.rank, row.outcome, row.position])).toEqual([
      [1, "finished", text.length],
      [2, "finished", text.length],
    ]);
    const guestRow = rows.find((row) => row.display_name_snapshot === "Invitée");
    expect(Number(guestRow?.total_inputs)).toBe(text.length + 1);
    expect(Number(guestRow?.correct_inputs)).toBe(text.length);

    // Everyone's progress came at most four times a second (F-04.4).
    const progressTimes = h.received.filter((message) => message.event === "race:progress").map((message) => (message.payload as RaceProgressPayload).serverNow);
    expect(progressTimes.length).toBeGreaterThan(3);
    for (const [index, time] of progressTimes.entries()) {
      const inOneSecond = progressTimes.slice(index).filter((later) => later - time < 1_000).length;
      expect(inOneSecond).toBeLessThanOrEqual(4);
    }

    // The results page, rendered by the server from the database, for an entrant only.
    const page = await fetch(`${a.origin}/races/${raceId}`, { headers: { cookie: host.cookie, "accept-language": "fr" } });
    const html = await page.text();
    expect(html).toContain("Invitée");
    expect(html).toContain("Fin de la");
    const stranger = await account("int-stranger", "Inconnue");
    const hidden = await (await fetch(`${a.origin}/races/${raceId}`, { headers: { cookie: stranger.cookie, "accept-language": "fr" } })).text();
    expect(hidden).toContain("Course introuvable");
    expect(hidden).not.toContain("Invitée");
  }, 90_000);

  it("notices a runner whose connection goes silent within about 15 s, keeps its place 30 s, then ranks it as abandoned (D-06)", async () => {
    const a = servers[0] ?? (await server(0));
    const host = await account("int-host-6", "Hôte six");
    const guest = await account("int-guest-6", "Invité six");
    const code = await room(host, [guest]);
    const proxy = await startStallingProxy(Number(new URL(a.origin).port));
    proxies.push(proxy);
    const h = await tab(a.origin, host.cookie);
    // The guest's only tab goes through a network that will go silent.
    const g = await tab(a.origin, guest.cookie, `http://127.0.0.1:${proxy.port}`);
    expect(await h.ask("room:watch", { code })).toMatchObject({ ok: true });
    expect(await g.ask("room:watch", { code })).toMatchObject({ ok: true });
    expect(await h.ask("race:start", {})).toEqual({ ok: true });
    const reveal = (await g.next("race:reveal")) as RaceRevealPayload;
    const raceId = reveal.reveal.raceId;
    const guestEntrant = reveal.selfEntrantId;
    await startsAt(reveal);
    const text = reveal.reveal.text;
    await typeAll(g, raceId, text.slice(0, 4));
    const stalledAt = Date.now();
    proxy.stall();
    // Nothing closes: the heartbeat finds the loss (at most about 15 s), then the grace runs 30 s.
    await h.next(
      "race:progress",
      (payload: RaceProgressPayload) => payload.broadcast.entrants.some((entrant) => entrant.entrantId === guestEntrant && entrant.status === "abandoned"),
      60_000,
    );
    const elapsed = Date.now() - stalledAt;
    expect(elapsed).toBeGreaterThanOrEqual(30_000);
    expect(elapsed).toBeLessThan(30_000 + 15_000 + 2_000);
    await typeAll(h, raceId, text);
    await h.next("room:snapshot", (snapshot: PublicRoomSnapshot) => snapshot.phase === "results", 15_000);
    const rows = await query<{ display_name_snapshot: string; outcome: string; abandonment_reason: string | null; position: number }>(
      "select e.display_name_snapshot, r.outcome, r.abandonment_reason, r.position from race_results r join race_entrants e on e.id = r.entrant_id where r.race_id = $1 order by r.rank",
      [raceId],
    );
    expect(rows).toEqual([
      { display_name_snapshot: "Hôte six", outcome: "finished", abandonment_reason: null, position: text.length },
      { display_name_snapshot: "Invité six", outcome: "abandoned", abandonment_reason: "disconnection", position: 4 },
    ]);
  }, 90_000);

  it("gives the input to one tab of an entrant, moves it on request, and resumes a reconnected tab from the snapshot", async () => {
    const a = servers[0] ?? (await server(0));
    const host = await account("int-host-2", "Hôte deux");
    const guest = await account("int-guest-2", "Invité deux");
    const code = await room(host, [guest]);
    const h = await tab(a.origin, host.cookie);
    const first = await tab(a.origin, guest.cookie);
    await h.ask("room:watch", { code });
    // Each page keeps its own id across reconnections, as the room page does.
    await first.ask("room:watch", { code, pageId: FIRST_PAGE });
    expect(await h.ask("race:start", {})).toEqual({ ok: true });
    const reveal = (await first.next("race:reveal")) as RaceRevealPayload;
    const raceId = reveal.reveal.raceId;
    expect(((await first.next("race:self")) as RaceSelfPayload).control).toBe("controlling");

    // A second tab of the same member observes; its batches are discarded before the engine.
    const second = await tab(a.origin, guest.cookie);
    await second.ask("room:watch", { code, pageId: SECOND_PAGE });
    expect(((await second.next("race:self")) as RaceSelfPayload).control).toBe("observing");
    await startsAt(reveal);
    expect(await second.ask("race:batch", { raceId, seq: 1, textVersion: 0, events: [{ type: "insert", grapheme: "T" }] })).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    let seq = await typeAll(first, raceId, reveal.reveal.text.slice(0, 4));
    expect(await second.ask("race:control", { raceId })).toEqual({ ok: true });
    expect(await first.ask("race:batch", { raceId, seq, textVersion: 0, events: [{ type: "insert", grapheme: "e" }] })).toEqual({ ok: false, error: "NOT_CONTROLLING" });
    seq = await typeAll(second, raceId, reveal.reveal.text.slice(4, 6), seq);

    // The typing page loses its connection and reconnects: it takes its input back and learns
    // what was applied, whether or not the server has seen its former socket close yet.
    second.socket.close();
    first.socket.close();
    const back = await tab(a.origin, guest.cookie);
    await back.ask("room:watch", { code, pageId: SECOND_PAGE });
    const self = (await back.next("race:self")) as RaceSelfPayload;
    expect(self).toMatchObject({ control: "controlling", snapshot: { ackSeq: seq - 1, typed: reveal.reveal.text.slice(0, 6) } });
    // A batch already applied, sent again after the reconnection, is recognised.
    expect(await back.ask("race:batch", { raceId, seq: seq - 1, textVersion: 0, events: reveal.reveal.text.slice(4, 6).map((grapheme) => ({ type: "insert", grapheme })) })).toMatchObject({
      ok: true,
      result: { outcome: "duplicate" },
    });
    // A player's 10 batches a second count across all its tabs and survive a reconnection:
    // the tabs above and the resend used most of this second.
    await sleep(1_000);
    await typeAll(back, raceId, reveal.reveal.text.slice(6), seq);
    await typeAll(h, raceId, reveal.reveal.text);
    await h.next("room:snapshot", (snapshot: PublicRoomSnapshot) => snapshot.phase === "results" && snapshot.race?.raceId === raceId, 15_000);
  }, 90_000);

  it("leaves a race to the process that owns it, recovers it once that process stops renewing, and refuses the old owner's late writes", async () => {
    const a = servers[0] ?? (await server(0));
    const b = await server(1);
    const host = await account("int-host-3", "Hôte trois");
    const guest = await account("int-guest-3", "Invité trois");
    const code = await room(host, [guest]);
    const h = await tab(a.origin, host.cookie);
    const g = await tab(a.origin, guest.cookie);
    await h.ask("room:watch", { code });
    await g.ask("room:watch", { code });
    expect(await h.ask("race:start", {})).toEqual({ ok: true });
    const reveal = (await g.next("race:reveal")) as RaceRevealPayload;
    const raceId = reveal.reveal.raceId;
    await startsAt(reveal);
    const seq = await typeAll(g, raceId, reveal.reveal.text.slice(0, 4));

    // Process B sees a race it does not own: it runs nothing for it and interrupts nothing.
    const onB = await tab(b.origin, host.cookie);
    expect(await onB.ask("room:watch", { code })).toMatchObject({ ok: true, snapshot: { phase: "racing" } });
    expect(onB.received.some((message) => message.event === "race:reveal")).toBe(false);
    expect((await query<{ state: string }>("select state from races where id = $1", [raceId]))[0]?.state).toBe("racing");

    // Process A freezes (no renewal) until its lease has passed on the database clock.
    a.child.kill("SIGSTOP");
    try {
      for (;;) {
        const [lease] = await query<{ expired: boolean }>("select lease_expires_at <= statement_timestamp() as expired from races where id = $1", [raceId]);
        if (lease?.expired === true) {
          break;
        }
        await sleep(1_000);
      }
      // The next opening of the room on B recovers the race: interrupted, no result (D-06).
      const recoverer = await tab(b.origin, guest.cookie);
      await recoverer.ask("room:watch", { code });
      const recovered = (await recoverer.next("room:snapshot", (snapshot: PublicRoomSnapshot) => snapshot.phase === "waiting", 15_000)) as PublicRoomSnapshot;
      expect(recovered.race).toEqual({ raceId, state: "interrupted", interruptionReason: "owner_lost" });
    } finally {
      a.child.kill("SIGCONT");
    }

    // A wakes up: its lease is past, its renewal refused, and nothing it does counts any more.
    await sleep(3_000);
    // The guest's socket to A did not survive the freeze: without a ping for more than 15 s the
    // client's own heartbeat closed it (F-04.6). The page comes back to A as a new tab, at once.
    expect(g.socket.connected).toBe(false);
    const back = await tab(a.origin, guest.cookie);
    await back.ask("room:watch", { code });
    const late = (await back.ask("race:batch", { raceId, seq, textVersion: 0, events: [{ type: "insert", grapheme: "e" }] })) as RaceBatchAck;
    expect(late.ok === false || late.result.outcome !== "applied").toBe(true);
    expect(await query("select 1 from race_results where race_id = $1", [raceId])).toEqual([]);
    expect((await query<{ state: string; owner_epoch: number }>("select state, owner_epoch from races where id = $1", [raceId]))[0]).toEqual({ state: "interrupted", owner_epoch: 2 });
    expect((await fetch(`${a.origin}/api/health/live`)).ok).toBe(true);
    expect(a.output()).toContain("lost: the race stops here");
  }, 120_000);

  it("interrupts its own race when it stops (SIGTERM), and its room waits again", async () => {
    const b = servers[1] ?? (await server(1));
    const host = await account("int-host-4", "Hôte quatre");
    const guest = await account("int-guest-4", "Invité quatre");
    const code = await room(host, [guest]);
    const h = await tab(b.origin, host.cookie);
    await h.ask("room:watch", { code });
    expect(await h.ask("race:start", {})).toEqual({ ok: true });
    const reveal = (await h.next("race:reveal")) as RaceRevealPayload;
    await startsAt(reveal);
    b.child.kill("SIGTERM");
    expect(await b.exited).toBe(0);
    expect((await query<{ state: string; interruption_reason: string }>("select state, interruption_reason from races where id = $1", [reveal.reveal.raceId]))[0]).toEqual({
      state: "interrupted",
      interruption_reason: "server_stopped",
    });
    expect(b.output()).toContain("1 interrupted");
    const [lobby] = await query<{ phase: string }>("select l.phase from lobbies l join races r on r.id = l.current_race_id where r.id = $1", [reveal.reveal.raceId]);
    expect(lobby?.phase).toBe("waiting");
  }, 60_000);

  it("refuses every start in production without validated race texts, and says so at boot", async () => {
    // The process of the previous test has exited: its port is free again.
    const c = await startServer(PORTS[1] ?? 3302, { RACE_FIXTURE_TEXTS: "" });
    servers.push(c);
    expect(c.output()).toContain("[races] no validated race texts yet: race starts are refused");
    const host = await account("int-host-5", "Hôte cinq");
    const guest = await account("int-guest-5", "Invité cinq");
    const code = await room(host, [guest]);
    const h = await tab(c.origin, host.cookie);
    expect(await h.ask("room:watch", { code })).toMatchObject({ ok: true });
    expect(await h.ask("race:start", {})).toEqual({ ok: false, error: "RACES_UNAVAILABLE" });
    expect(await query<{ races: number }>("select count(r.id)::int as races from lobbies l left join races r on r.lobby_id = l.id where l.code = $1", [code])).toEqual([
      { races: 0 },
    ]);
  }, 60_000);
});
