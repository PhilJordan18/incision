import { expect, test } from "@playwright/test";
import type { Socket } from "socket.io-client";
import type { EntrantSnapshotPayload, RaceRevealPayload } from "../src/races/protocol";
import { connectSocket, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

type Grant = { milestone: number; kind: string };
type Self = { raceId: string; grants: Grant[] };

/**
 * BONUS-02 for guests: an account and a guest race in an Arcade room against the real server and
 * database. Bonuses go to whoever trails, so the account leads to 25 % (the guest earns one), then
 * the guest overtakes to 75 % (the account earns the next ones). Each activates its own.
 */
test("a guest and an account both activate their bonus, announced once and kept in the journal", async ({ context, baseURL }) => {
  const origin = baseURL ?? "";
  await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Visitor" } });
  const cookie = (await context.cookies()).find((value) => value.name === "incision.guest");
  if (!cookie) throw new Error("Missing guest cookie");
  const guestId = cookie.value.split(".")[1];
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Bonus host') returning id,session_version");
  const [room] = await query<{ id: string }>("insert into lobbies(code,capacity) values('GBNSXY',30) returning id");
  if (!account || !room) throw new Error("Missing fixture");
  const [hostMember] = await query<{ id: string }>("insert into lobby_members(lobby_id,account_id,role,display_name,display_name_canonical) values($1,$2,'participant','Bonus host','bonus host') returning id", [room.id, account.id]);
  await query("update lobbies set host_member_id=$2 where id=$1", [room.id, hostMember?.id]);
  await query("insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,'participant','Visitor','visitor')", [room.id, guestId]);
  // Arcade (CONF-09): bonuses on, a short text, no time limit.
  await query("insert into lobby_settings(lobby_id,text_language,word_count,time_limit_ms,error_mode,bonuses_enabled) values($1,'en',10,null,'mandatory',true)", [room.id]);
  const hostCookie = await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) });
  const { socket: host } = await connectSocket(origin, `${SESSION_COOKIE}=${hostCookie}`);
  const { socket: guest } = await connectSocket(origin, `incision.guest=${cookie.value}`);
  try {
    const self = new Map<Socket, Self>();
    const announcements: unknown[] = [];
    let reveal: RaceRevealPayload | undefined;
    let racing = false;
    for (const socket of [host, guest]) socket.on("race:bonus:self", (payload: Self) => self.set(socket, payload));
    host.on("race:bonus:announcement", (payload: unknown) => announcements.push(payload));
    guest.on("race:reveal", (payload: RaceRevealPayload) => { reveal = payload; });
    guest.on("race:progress", (payload: { broadcast: { phase: string } }) => { racing ||= payload.broadcast.phase === "racing"; });
    expect(await host.timeout(5000).emitWithAck("room:watch", { code: "GBNSXY" })).toMatchObject({ ok: true });
    expect(await guest.timeout(5000).emitWithAck("room:watch", { code: "GBNSXY" })).toMatchObject({ ok: true });
    expect(await host.timeout(5000).emitWithAck("race:start", {})).toEqual({ ok: true });
    await expect.poll(() => racing, { timeout: 8000 }).toBe(true);
    if (!reveal) throw new Error("Missing reveal");
    const raceId = reveal.reveal.raceId;
    // Each tab types its own current text: a bonus may change it, and the next batch then answers
    // with a resync carrying the new version, as the browser client handles it.
    type Cursor = { target: readonly string[]; typed: number; textVersion: number; seq: number };
    const cursors = new Map<Socket, Cursor>([host, guest].map((socket) => [socket, { target: reveal!.reveal.text, typed: 0, textVersion: 0, seq: 0 }]));
    let limited = 0; let last: unknown;
    async function typeTo(socket: Socket, percent: number): Promise<void> {
      const cursor = cursors.get(socket)!;
      for (let round = 0; cursor.typed < Math.ceil(cursor.target.length * percent / 100); round++) {
        if (round > 20) throw new Error(`typing stuck: ${JSON.stringify({ ...cursor, target: cursor.target.length, last })}`);
        const goal = Math.ceil(cursor.target.length * percent / 100);
        const events = cursor.target.slice(cursor.typed, Math.min(goal, cursor.typed + 32)).map((grapheme) => ({ type: "insert", grapheme }));
        cursor.seq += 1;
        const batch = { raceId, textVersion: cursor.textVersion, seq: cursor.seq, events };
        let answer = await socket.timeout(5000).emitWithAck("race:batch", batch);
        // Like typing-session.ts: a rate-limited batch is resent unchanged after 300 ms.
        for (let retry = 0; retry < 5 && answer.ok === false && answer.error === "RATE_LIMITED"; retry++) {
          limited++; await new Promise((resolve) => setTimeout(resolve, 300));
          answer = await socket.timeout(5000).emitWithAck("race:batch", batch);
        }
        expect(answer, JSON.stringify(answer)).toMatchObject({ ok: true });
        last = answer;
        const result = answer.result as { outcome: string; textVersion?: number; snapshot?: EntrantSnapshotPayload };
        if (result.outcome === "resync" && result.snapshot) {
          Object.assign(cursor, { target: result.snapshot.target, typed: result.snapshot.typed.length, textVersion: result.snapshot.textVersion,
            seq: result.snapshot.ackSeq });
          continue;
        }
        expect(result.outcome).toBe("applied");
        cursor.typed += events.length; cursor.textVersion = result.textVersion ?? cursor.textVersion;
      }
    }
    const activate = async (socket: Socket, milestone: number) => {
      const answer = await socket.timeout(5000).emitWithAck("race:bonus:activate", { raceId, seq: 1, milestone });
      expect(answer, JSON.stringify(answer.result)).toMatchObject({ ok: true, result: { ok: true, seq: 1 } });
      return answer;
    };

    // The account leads past 25 %: the trailing guest earns a bonus and uses it at once, while
    // the account is still a valid target for Rallonge or Brouillard.
    await typeTo(host, 26);
    await expect.poll(() => self.get(guest)?.grants.map((grant) => grant.milestone), { timeout: 5000 }).toEqual([25]);
    const guestAnswer = await activate(guest, 25);
    // A replay returns the same receipt and has no further effect; only the attached snapshot may be fresher.
    const replay = await guest.timeout(5000).emitWithAck("race:bonus:activate", { raceId, seq: 1, milestone: 25 });
    expect(replay.result).toEqual(guestAnswer.result);
    await expect.poll(() => self.get(guest)?.grants ?? null).toEqual([]);
    await expect.poll(() => announcements.length).toBe(1);

    // The guest overtakes past 75 %: the account now trails and earns two; its bonus keeps working.
    await typeTo(guest, 76);
    await expect.poll(() => self.get(host)?.grants.map((grant) => grant.milestone), { timeout: 5000 }).toEqual([50, 75]);
    await activate(host, 50);
    await expect.poll(() => announcements.length).toBe(2);
    expect(announcements.length).toBe(2);
    test.info().annotations.push({ type: "rate-limited batches resent", description: String(limited) });

    for (const socket of [guest, host]) expect(await socket.timeout(5000).emitWithAck("race:abandon", { raceId })).toEqual({ ok: true });
    const journals = () => query<{ kind: string; bonus_journal: { grants: { milestone: number; activation?: unknown }[] } | null }>(
      "select e.kind, r.bonus_journal from race_results r join race_entrants e on e.id=r.entrant_id where r.race_id=$1 order by e.kind", [raceId]);
    await expect.poll(async () => (await journals()).length, { timeout: 10_000 }).toBe(2);
    const [guestRow, hostRow] = await journals();
    expect(guestRow?.kind).toBe("guest");
    expect(guestRow?.bonus_journal?.grants).toEqual([{ kind: expect.any(String), milestone: 25, activation: expect.objectContaining({ atMs: expect.any(Number) }) }]);
    expect(hostRow?.kind).toBe("human");
    expect(hostRow?.bonus_journal?.grants.map((grant) => [grant.milestone, grant.activation !== undefined])).toEqual([[50, true], [75, false]]);
  } finally {
    host.close(); guest.close();
    await query("delete from lobbies where id=$1", [room.id]);
  }
});
