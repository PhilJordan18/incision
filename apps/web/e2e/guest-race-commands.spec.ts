import { expect, test } from "@playwright/test";
import type { RaceRevealPayload } from "../src/races/protocol";
import { connectSocket, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/** Internal fixture admission only; the public guest entry flow stays closed until complete. */
test("an admitted guest types with isolated identity and renews only accepted activity", async ({ context, baseURL }) => {
  const origin = baseURL ?? "";
  await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Visitor" } });
  const cookie = (await context.cookies()).find((value) => value.name === "incision.guest");
  if (!cookie) throw new Error("Missing guest cookie");
  const guestId = cookie.value.split(".")[1];
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Fixture host') returning id,session_version");
  const [room] = await query<{ id: string }>("insert into lobbies(code,capacity) values('UVWXYZ',30) returning id");
  if (!account || !room) throw new Error("Missing fixture");
  const [hostMember] = await query<{ id: string }>("insert into lobby_members(lobby_id,account_id,role,display_name,display_name_canonical) values($1,$2,'participant','Fixture host','fixture host') returning id", [room.id, account.id]);
  await query("update lobbies set host_member_id=$2 where id=$1", [room.id, hostMember?.id]);
  await query("insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,'participant','Visitor','visitor')", [room.id, guestId]);
  await query("update guest_sessions set created_at=now()-interval '1 hour',last_seen_at=now()-interval '1 hour',expires_at=now()+interval '23 hours' where id=$1", [guestId]);
  const activity = () => query<{ last_seen_at: Date; expires_at: Date }>("select last_seen_at,expires_at from guest_sessions where id=$1", [guestId]);
  const before = await activity();
  const hostCookie = await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) });
  const { socket: host } = await connectSocket(origin, `${SESSION_COOKIE}=${hostCookie}`);
  const { socket: guest } = await connectSocket(origin, `incision.guest=${cookie.value}`);
  try {
    await host.timeout(5000).emitWithAck("room:watch", { code: "UVWXYZ" });
    await guest.timeout(5000).emitWithAck("room:watch", { code: "UVWXYZ" });
    let reveal: RaceRevealPayload | undefined;
    let racing = false;
    let activityEvents = 0;
    guest.on("race:reveal", (payload: RaceRevealPayload) => { reveal = payload; });
    guest.on("race:progress", (payload: { broadcast: { phase: string } }) => { racing ||= payload.broadcast.phase === "racing"; });
    guest.on("guest:activity", () => { activityEvents++; });
    expect(await host.timeout(5000).emitWithAck("race:start", {})).toEqual({ ok: true });
    await expect.poll(() => racing, { timeout: 6000 }).toBe(true);
    if (!reveal) throw new Error("Missing guest reveal");
    expect(reveal.selfEntrantId).not.toBeNull();
    const batch = { raceId: reveal.reveal.raceId, textVersion: 0, seq: 1, events: [{ type: "insert", grapheme: reveal.reveal.text[0] }] };
    expect(await guest.timeout(5000).emitWithAck("race:batch", batch)).toMatchObject({ ok: true, result: { outcome: "applied" } });
    const after = await activity();
    expect(after[0]!.last_seen_at.getTime()).toBeGreaterThan(before[0]!.last_seen_at.getTime());
    expect(after[0]!.expires_at.getTime() - after[0]!.last_seen_at.getTime()).toBe(86_400_000);
    await expect.poll(() => activityEvents).toBe(1);
    expect(await guest.timeout(5000).emitWithAck("race:batch", batch)).toMatchObject({ ok: true, result: { outcome: "duplicate" } });
    expect(await activity()).toEqual(after);
    expect(await guest.timeout(5000).emitWithAck("race:batch", { ...batch, seq: 2, events: [{ type: "escape" }] })).toEqual({ ok: false, error: "INVALID_PAYLOAD" });
    expect(await activity()).toEqual(after); expect(activityEvents).toBe(1);
    const refresh = await context.request.post("/api/guest/session/refresh", { headers: { Origin: origin }, data: {} });
    expect(refresh.status()).toBe(200); expect(refresh.headers()["set-cookie"]).toContain("HttpOnly");
    expect(await activity()).toEqual(after);
    expect(await guest.timeout(5000).emitWithAck("race:present", { raceId: reveal.reveal.raceId })).toEqual({ ok: true });
    await expect.poll(() => activityEvents).toBe(2);
  } finally {
    host.close(); guest.close();
    await query("delete from lobbies where id=$1", [room.id]);
  }
});
