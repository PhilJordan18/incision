import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function visitor(browser: Browser, locale: string, javaScriptEnabled = true): Promise<Page> {
  const context = await browser.newContext({ locale, reducedMotion: "reduce", javaScriptEnabled }); contexts.push(context);
  return context.newPage();
}
async function account(browser: Browser, name: string, locale: string, javaScriptEnabled = true) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id,session_version", [name]);
  if (!row) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce", javaScriptEnabled }); contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return { page: await context.newPage(), accountId: row.id };
}
const live = /^\[\.(En direct|Live)\]$/;
const label = { private: /^(Privée|Private)$/, code: /^(Sur code|By code)$/, public: /^(Publique|Public)$/ };
const find = /^(Trouver une salle|Find a room)$/;
const noRoom = /^(Aucune salle publique n’a de place pour l’instant\.|No public room has a free place right now\.)$/;

/** A room opened by its own host account, then given `bots` bots and `capacity` places. */
async function hostedRoom(browser: Browser, name: string, visibility: keyof typeof label, options: { capacity?: number; bots?: number } = {}) {
  const host = await account(browser, name, "fr-CA");
  await host.page.goto("/rooms/new");
  await host.page.getByRole("group", { name: /^(Accès|Access)$/ }).getByRole("radio", { name: label[visibility] }).check();
  await host.page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(host.page.getByText(live)).toBeVisible();
  const code = host.page.url().split("/").at(-1)!;
  const [room] = await query<{ id: string }>("update lobbies set capacity=$2 where code=$1 returning id", [code, options.capacity ?? 30]);
  for (let n = 0; n < (options.bots ?? 0); n++) await query("insert into lobby_bots(lobby_id, level) values($1, 'noob')", [room!.id]);
  return { code, id: room!.id };
}
async function membership(accountId: string) {
  return query<{ code: string; role: string }>(`select l.code, m.role from lobby_members m join lobbies l on l.id=m.lobby_id
    where m.account_id=$1 and m.left_at is null`, [accountId]);
}
async function auditEveryLayout(page: Page, name: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "aube" : "abysse");
    for (const width of [1440, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page);
      await expectNoAccessibilityViolation(page);
      await page.screenshot({ path: test.info().outputPath(`${name}-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

for (const locale of ["fr-CA", "en-US"]) {
  test(`an account joins the fullest admissible PUBLIC room as a participant (${locale})`, async ({ browser }) => {
    test.slow();
    await hostedRoom(browser, "Roomy host", "public", { capacity: 30 });
    const tight = await hostedRoom(browser, "Tight host", "public", { capacity: 4, bots: 1 });
    // Tighter still, but not PUBLIC, or banning the seeker: never picked.
    await hostedRoom(browser, "Code host", "code", { capacity: 3, bots: 1 });
    const banned = await hostedRoom(browser, "Ban host", "public", { capacity: 3, bots: 1 });
    const seeker = await account(browser, "Quick seeker", locale);
    await query("insert into lobby_bans(lobby_id, account_id) values($1, $2)", [banned.id, seeker.accountId]);

    await seeker.page.goto("/rooms");
    const card = seeker.page.getByRole("region", { name: /^(Une course, tout de suite|A race, right now)$/ });
    await expect(card.getByRole("button", { name: find })).toBeVisible();
    // The card's button is the page's one red action (design rule 1).
    expect(await seeker.page.locator("main .bg-action").count()).toBe(1);
    await auditEveryLayout(seeker.page, `quickplay-card-${locale}`);
    await card.getByRole("button", { name: find }).focus();
    await seeker.page.keyboard.press("Enter");
    await expect(seeker.page).toHaveURL(new RegExp(`/rooms/${tight.code}$`));
    await expect(seeker.page.getByText(live)).toBeVisible();
    expect(await membership(seeker.accountId)).toEqual([{ code: tight.code, role: "participant" }]);
  });

  test(`without a room, an account is offered a PUBLIC room with the defaults, created only on request (${locale})`, async ({ browser }) => {
    test.slow();
    await hostedRoom(browser, "Full host", "public", { capacity: 2, bots: 1 });
    await hostedRoom(browser, "Code only host", "code");
    const seeker = await account(browser, "Empty seeker", locale);
    await seeker.page.goto("/rooms");
    const before = await query("select id from lobbies");
    await seeker.page.getByRole("button", { name: find }).click();
    await expect(seeker.page.getByRole("status").filter({ hasText: noRoom })).toBeVisible();
    expect(await query("select id from lobbies")).toEqual(before);
    expect(await membership(seeker.accountId)).toEqual([]);
    await auditEveryLayout(seeker.page, `quickplay-empty-${locale}`);

    await seeker.page.getByRole("button", { name: /^(Créer une salle publique|Create a public room)$/ }).click();
    await expect(seeker.page.getByText(live)).toBeVisible();
    const code = seeker.page.url().split("/").at(-1)!;
    expect(await query(`select l.visibility, l.capacity, s.text_language, s.word_count, s.complexity, s.bonuses_enabled, s.time_limit_ms
      from lobbies l join lobby_settings s on s.lobby_id=l.id where l.code=$1`, [code])).toEqual([{
      visibility: "public", capacity: 30, text_language: locale.slice(0, 2), word_count: 50, complexity: "medium", bonuses_enabled: false, time_limit_ms: null }]);
    expect(await query("select count(*)::int as n from lobby_bots l join lobbies r on r.id=l.lobby_id where r.code=$1", [code])).toEqual([{ n: 0 }]);
  });

  test(`a member of a room is sent back to it, not moved (${locale})`, async ({ browser }) => {
    await hostedRoom(browser, "Open host", "public");
    const member = await account(browser, "Busy member", locale);
    const own = await hostedRoom(browser, "Own host", "code");
    await member.page.goto(`/rooms/${own.code}`);
    await member.page.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
    await expect(member.page.getByText(live)).toBeVisible();
    await member.page.goto("/rooms");
    await member.page.getByRole("button", { name: find }).click();
    const card = member.page.getByRole("region", { name: /^(Une course, tout de suite|A race, right now)$/ });
    await expect(card.getByRole("alert")).toContainText(/(Tu es déjà dans une salle|You are already in a room)/);
    await expect(member.page.getByRole("link", { name: new RegExp(own.code) })).toBeVisible();
    expect(await membership(member.accountId)).toEqual([{ code: own.code, role: "participant" }]);
  });

  test(`a guest quickplays with a nickname only, and sees the empty state without a room (${locale})`, async ({ browser }) => {
    test.slow();
    const page = await visitor(browser, locale);
    await page.goto("/rooms");
    await page.getByRole("button", { name: find }).click();
    await expect(page).toHaveURL(/\/guest\?quickplay=1$/);
    await expect(page.getByLabel(/^(Code de salle|Room code)$/)).toHaveCount(0);
    await expect(page.getByRole("radio")).toHaveCount(0);
    await page.getByLabel(/^(Pseudo pour cette salle|Nickname for this room)$/).fill("Mousse");
    await page.getByRole("button", { name: find }).click();
    await expect(page.getByRole("status").filter({ hasText: /(Un invité ne crée pas de salle|Guests cannot create rooms)/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^(Voir les salles publiques|See the public rooms)$/ })).toBeVisible();
    expect(await query("select id from lobbies")).toEqual([]);
    await auditEveryLayout(page, `quickplay-guest-empty-${locale}`);

    const room = await hostedRoom(browser, "Guest target host", "public", { capacity: 3 });
    await page.getByRole("button", { name: find }).click();
    await expect(page).toHaveURL(new RegExp(`/rooms/${room.code}$`));
    expect(await query("select role, display_name from lobby_members where lobby_id=$1 and guest_session_id is not null", [room.id]))
      .toEqual([{ role: "participant", display_name: "Mousse" }]);
  });
}

test("quickplay and the offered creation work without JavaScript", async ({ browser }) => {
  const seeker = await account(browser, "No JS seeker", "fr-CA", false);
  await seeker.page.goto("/rooms");
  await seeker.page.getByRole("button", { name: find }).click();
  await expect(seeker.page.getByText(noRoom)).toBeVisible();
  await seeker.page.getByRole("button", { name: "Créer une salle publique" }).click();
  await expect(seeker.page).toHaveURL(/\/rooms\/[A-Z2-9]{6}$/);
  expect(await query("select l.visibility from lobbies l join lobby_members m on m.id=l.host_member_id where m.account_id=$1", [seeker.accountId]))
    .toEqual([{ visibility: "public" }]);

  const other = await account(browser, "No JS joiner", "fr-CA", false);
  await other.page.goto("/rooms");
  await other.page.getByRole("button", { name: find }).click();
  await expect(other.page).toHaveURL(seeker.page.url());
  expect(await membership(other.accountId)).toEqual([{ code: seeker.page.url().split("/").at(-1)!, role: "participant" }]);
});
