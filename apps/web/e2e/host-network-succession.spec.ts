import { expect, test } from "@playwright/test";
import { connectSocket, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/** Real last-socket timers and SQL; no public guest admission is enabled by this fixture. */
test("account host reconnects within grace then succeeds to a guest spectator after its last tab leaves", async ({ context, baseURL }) => {
  test.setTimeout(65_000);
  const origin = baseURL ?? "";
  await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Successor" } });
  const cookie = (await context.cookies()).find((value) => value.name === "incision.guest");
  if (!cookie) throw new Error("Missing guest fixture cookie");
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Network host') returning id,session_version");
  const [room] = await query<{ id: string }>("insert into lobbies(code,capacity) values('STUVWX',30) returning id");
  if (!account || !room) throw new Error("Missing fixture");
  const [hostMember] = await query<{ id: string }>("insert into lobby_members(lobby_id,account_id,role,display_name,display_name_canonical) values($1,$2,'spectator','Network host','network host') returning id", [room.id, account.id]);
  const [guestMember] = await query<{ id: string }>("insert into lobby_members(lobby_id,guest_session_id,role,display_name,display_name_canonical) values($1,$2,'spectator','Successor','successor') returning id", [room.id, cookie.value.split(".")[1]]);
  await query("update lobbies set host_member_id=$2 where id=$1", [room.id, hostMember?.id]);
  const hostCookie = `${SESSION_COOKIE}=${await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) })}`;
  const { socket: first } = await connectSocket(origin, hostCookie);
  const { socket: second } = await connectSocket(origin, hostCookie);
  const { socket: guest } = await connectSocket(origin, `incision.guest=${cookie.value}`);
  const { socket: returning } = await connectSocket(origin, hostCookie);
  const watch = (socket: typeof first) => socket.timeout(5000).emitWithAck("room:watch", { code: "STUVWX" });
  const host = async () => (await query<{ host_member_id: string }>("select host_member_id from lobbies where id=$1", [room.id]))[0]?.host_member_id;
  try {
    for (const socket of [first, second, guest]) expect(await watch(socket)).toMatchObject({ ok: true });
    first.close();
    expect(await watch(second)).toMatchObject({ ok: true, selfMemberId: hostMember?.id });
    second.close();
    expect(await watch(returning)).toMatchObject({ ok: true, selfMemberId: hostMember?.id });
    expect(await host()).toBe(hostMember?.id);
    returning.close();
    await expect.poll(host, { timeout: 35_000, intervals: [250] }).toBe(guestMember?.id);
    expect(await watch(guest)).toMatchObject({ ok: true, selfMemberId: guestMember?.id });
    const { socket: late } = await connectSocket(origin, hostCookie);
    try { expect(await watch(late)).toEqual({ ok: false, error: "NOT_A_MEMBER" }); }
    finally { late.close(); }
    expect((await query("select id from accounts where id=$1", [account.id]))).toHaveLength(1);
    expect((await query("select left_at from lobby_members where id=$1", [hostMember?.id]))[0]?.left_at).not.toBeNull();
  } finally {
    first.close(); second.close(); returning.close(); guest.close();
    await query("delete from lobbies where id=$1", [room.id]);
  }
});
