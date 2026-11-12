import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(context => context.close())); });
async function account(browser: Browser, name: string) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id,session_version", [name]);
  if (!row) throw new Error("Missing synthetic account");
  const context = await browser.newContext({ locale: "en-US", reducedMotion: "reduce" }); contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
  return { page: await context.newPage(), id: row.id };
}
for (const successor of [false, true]) test(`reading a finished race follows host grace, successor=${successor}`, async ({ browser }) => {
  test.setTimeout(90_000);
  const host = await account(browser, "Navigation host");
  await host.page.goto("/rooms/new"); await host.page.getByRole("button", { name: "Open the room", exact: true }).click();
  await expect(host.page.getByText("[.Live]", { exact: true })).toBeVisible();
  const code = host.page.url().split("/").at(-1)!;
  const bots = host.page.getByRole("region", { name: "Bots", exact: true });
  await bots.getByRole("combobox").selectOption("impossible"); await bots.getByRole("button", { name: "Add a bot", exact: true }).click();
  await expect(bots.getByRole("listitem")).toHaveCount(1);
  await host.page.getByRole("button", { name: "Start the race", exact: true }).click();
  await expect(host.page.getByLabel("Your typing", { exact: true })).toBeEnabled({ timeout: 10_000 });
  await host.page.getByRole("button", { name: "Give up the race", exact: true }).click();
  await host.page.getByRole("button", { name: "Yes, give up", exact: true }).click();
  await expect(host.page.getByRole("heading", { level: 1 })).toContainText(/End of the/i, { timeout: 20_000 });
  const [room] = await query<{ id: string; host_member_id: string; current_race_id: string }>("select id,host_member_id,current_race_id from lobbies where code=$1", [code]);
  if (!room) throw new Error("Missing finished room");
  let nextMember: string | undefined;
  if (successor) {
    const other = await account(browser, "Connected successor");
    await other.page.goto(`/rooms/${code}`); await other.page.getByRole("button", { name: "Join the room", exact: true }).click();
    await expect(other.page.getByText("[.Live]", { exact: true })).toBeVisible();
    nextMember = (await query<{ id: string }>("select id from lobby_members where lobby_id=$1 and account_id=$2 and left_at is null", [room.id, other.id]))[0]?.id;
    expect(nextMember).toBeDefined();
  }
  const state = async () => (await query<{ phase: string; host_member_id: string | null }>("select phase,host_member_id from lobbies where id=$1", [room.id]))[0];
  await host.page.getByRole("link", { name: "Open the race page", exact: true }).click();
  await expect(host.page).toHaveURL(new RegExp(`/races/${room.current_race_id}$`));
  // Page navigation is a lost room socket, not a confirmed voluntary leave.
  expect(await state()).toMatchObject({ phase: "results", host_member_id: room.host_member_id });
  await expect.poll(state, { timeout: 35_000, intervals: [250] }).toMatchObject(successor
    ? { phase: "results", host_member_id: nextMember }
    : { phase: "closed", host_member_id: null });
  const [departed] = await query<{ left_at: Date | null }>("select left_at from lobby_members where id=$1", [room.host_member_id]);
  expect(departed?.left_at).not.toBeNull();
  expect(await query("select entrant_id from race_results where race_id=$1", [room.current_race_id])).toHaveLength(2);
  await host.page.reload(); await expect(host.page.getByRole("table").getByText(/Bot ·/)).toBeVisible();
});
