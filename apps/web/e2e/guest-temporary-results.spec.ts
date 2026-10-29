import { expect, test } from "@playwright/test";
import { connectSocket, query } from "./support";

test("guest-only race displays temporary results without durable metrics or historical access", async ({ browser, context, baseURL }) => {
  const origin = baseURL ?? "";
  const other = await browser.newContext({ baseURL: origin });
  const guests = [];
  for (const [index, ctx] of [context, other].entries()) {
    await ctx.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: `Visitor${index}` } });
    const cookie = (await ctx.cookies()).find((value) => value.name === "incision.guest");
    if (!cookie) throw new Error("Missing synthetic guest cookie");
    guests.push({ ctx, cookie, id: cookie.value.split(".")[1] });
  }
  const [room] = await query<{ id: string }>("insert into lobbies(code,capacity) values('RSTUVW',30) returning id");
  if (!room) throw new Error("Missing room fixture");
  const members: string[] = [];
  for (const [index, guest] of guests.entries()) {
    const [member] = await query<{ id: string }>("insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,'participant',$3,$3) returning id", [room.id, guest.id, `visitor${index}`]);
    if (!member) throw new Error("Missing member fixture"); members.push(member.id);
  }
  await query("update lobbies set host_member_id=$2 where id=$1", [room.id, members[0]]);
  const sockets = await Promise.all(guests.map(async (guest) => (await connectSocket(origin, `incision.guest=${guest.cookie.value}`)).socket));
  try {
    for (const socket of sockets) expect(await socket.timeout(5000).emitWithAck("room:watch", { code: "RSTUVW" })).toMatchObject({ ok: true });
    expect(await sockets[0]!.timeout(5000).emitWithAck("race:start", {})).toEqual({ ok: true });
    const [race] = await query<{ current_race_id: string }>("select current_race_id from lobbies where id=$1", [room.id]);
    if (!race) throw new Error("Missing race");
    for (const socket of sockets) expect(await socket.timeout(5000).emitWithAck("race:abandon", { raceId: race.current_race_id })).toEqual({ ok: true });
    const url = `/api/guest/rooms/${room.id}/races/${race.current_race_id}`;
    await expect.poll(async () => (await context.request.get(url)).status()).toBe(200);
    for (const guest of guests) {
      const response = await guest.ctx.request.get(url);
      expect(response.headers()["cache-control"]).toBe("private, no-store");
      expect(response.headers()["set-cookie"]).toBeUndefined();
      const body = await response.json();
      expect(body.race.entrants).toHaveLength(2);
      expect(body.race.entrants.filter((e: { isSelf: boolean }) => e.isSelf)).toHaveLength(1);
      expect(body.race.entrants.every((e: { result?: unknown }) => e.result !== undefined)).toBe(true);
      expect(body.race.personalRecord).toBeUndefined(); expect(body.race.personalKeyErrors).toBeUndefined();
      expect(JSON.stringify(body)).not.toContain("visitor"); expect(JSON.stringify(body)).not.toContain(guest.id);
    }
    for (const table of ["race_results", "race_wpm_series", "race_key_errors"]) {
      expect((await query<{ n: number }>(`select count(*)::int as n from ${table} where race_id=$1`, [race.current_race_id]))[0]?.n).toBe(0);
    }
    await query("delete from lobby_members where id=$1", [members[1]]);
    expect((await other.request.get(url)).status()).toBe(404);
    await query("update lobbies set phase='waiting' where id=$1", [room.id]);
    expect((await context.request.get(url)).status()).toBe(404);
  } finally {
    for (const socket of sockets) socket.close(); await other.close();
    await query("delete from lobbies where id=$1", [room.id]);
  }
});
