import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

test.use({ actionTimeout: 10_000 });
const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function visitor(browser: Browser, locale = "fr-CA", theme = "abysse") {
  const context = await browser.newContext({ locale }); contexts.push(context);
  await context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL ?? "" }]);
  return { context, page: await context.newPage() };
}
async function hostRoom(browser: Browser) {
  const { context, page } = await visitor(browser);
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Cloud host') returning id,session_version");
  if (!account) throw new Error("Missing synthetic account");
  const cookie = await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  await page.goto("/rooms/new"); await page.getByRole("button", { name: "Ouvrir la salle" }).click();
  await expect(page.getByText("[.En direct]", { exact: true })).toBeVisible();
  return { page, accountId: account.id, code: page.url().split("/").at(-1)! };
}
async function fillGuest(page: Page, code: string, nickname = "  Ｅ́va Marin  ") {
  await page.goto(`/guest?code=${code}`);
  await page.getByLabel(/^(Pseudo pour cette salle|Nickname for this room)$/).fill(nickname);
}
const enter = (page: Page) => page.getByRole("button", { name: /^(Entrer dans la salle|Enter the room)$/ }).click();
const live = (page: Page) => expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();

test("first-cookie tabs share one presence, race, preserve account results and inherit every host control", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await hostRoom(browser);
  const { context, page } = await visitor(browser);
  const second = await context.newPage();
  await Promise.all([fillGuest(page, host.code), fillGuest(second, host.code)]);
  await Promise.all([enter(page), enter(second)]);
  await Promise.all([live(page), live(second)]);
  await expect(host.page.getByRole("img", { name: "Invité", exact: true })).toBeVisible();
  const cookie = (await context.cookies()).find((cookie) => cookie.name === "incision.guest");
  expect(cookie?.httpOnly).toBe(true);
  const guestId = cookie?.value.split(".")[1];
  expect(await page.content()).not.toContain(cookie?.value);
  expect(await page.content()).not.toContain(guestId);
  const members = await query<{ id: string; joined_at: Date }>("select id,joined_at from lobby_members where guest_session_id=$1 and left_at is null", [guestId]);
  expect(members).toHaveLength(1);
  expect(await page.evaluate(() => document.cookie)).not.toContain("incision.guest");
  await second.close();
  await expect(page.getByRole("button", { name: "Lancer la course" })).toHaveCount(0);

  const other = await visitor(browser); await fillGuest(other.page, host.code, "éva marin"); await enter(other.page);
  await expect(other.page.locator("#guest-entry-error")).toContainText("déjà utilisé");
  await other.context.close();

  await host.page.getByRole("button", { name: "Lancer la course" }).click();
  await expect(page.getByLabel("Ta frappe")).toBeEnabled({ timeout: 10_000 });
  await page.reload(); await expect(page.getByLabel("Ta frappe")).toBeEnabled({ timeout: 10_000 });
  expect(await query("select id,joined_at from lobby_members where guest_session_id=$1 and left_at is null", [guestId])).toEqual(members);
  const text = (await page.locator(".course-texte").textContent()) ?? "";
  await Promise.all([page.getByLabel("Ta frappe").pressSequentially(text, { delay: 70 }), host.page.getByLabel("Ta frappe").pressSequentially(text, { delay: 70 })]);
  await expect(page.locator("#results-heading")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('a[href^="/races/"]')).toHaveCount(0);
  const [race] = await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [host.code]);
  if (!race) throw new Error("Missing synthetic race");
  const results = await query("select * from race_results where race_id=$1 order by entrant_id", [race.id]);
  expect(results).toHaveLength(2);
  expect(await query("select id from race_entrants where race_id=$1 and kind='guest' and (account_id is not null or member_id is not null or display_name_snapshot <> '#' || ordinal::text)", [race.id])).toEqual([]);
  await host.page.getByRole("button", { name: "Quitter la salle", exact: true }).click();
  await host.page.getByRole("button", { name: "Oui, quitter la salle", exact: true }).click();
  await expect(page.getByRole("button", { name: "Prochaine manche", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Prochaine manche", exact: true }).click();
  await expect(page.getByRole("button", { name: "Modifier les réglages", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Modifier les réglages", exact: true }).click();
  await page.getByRole("spinbutton", { name: /^Nombre de mots/ }).fill("10");
  await page.getByRole("button", { name: "Enregistrer les réglages", exact: true }).click();
  await expect.poll(async () => (await query<{ word_count: number }>("select word_count from lobby_settings s join lobbies l on l.id=s.lobby_id where l.code=$1", [host.code]))[0]?.word_count).toBe(10);
  const bots = page.getByRole("region", { name: "Bots", exact: true });
  await bots.getByRole("button", { name: "Ajouter un bot", exact: true }).click();
  await expect(bots.getByRole("listitem")).toHaveCount(1);
  await bots.getByRole("button", { name: "Retirer Bot 1", exact: true }).click();
  await expect(bots.getByRole("listitem")).toHaveCount(0);
  await bots.getByRole("combobox", { name: "Niveau du bot", exact: true }).selectOption("impossible");
  await bots.getByRole("button", { name: "Ajouter un bot", exact: true }).click();
  await expect(bots.getByRole("listitem")).toHaveCount(1);
  await page.getByRole("button", { name: "Lancer la course", exact: true }).click();
  await expect(page.getByLabel("Ta frappe")).toBeEnabled({ timeout: 10_000 });
  const guestOnlyText = (await page.locator(".course-texte").textContent()) ?? "";
  await page.getByLabel("Ta frappe").pressSequentially(guestOnlyText, { delay: 70 });
  await expect(page.locator("#results-heading")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("table").getByRole("row")).toHaveCount(3);
  const [temporary] = await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [host.code]);
  expect(temporary?.id).not.toBe(race.id);
  expect(await query("select * from race_results where race_id=$1", [temporary?.id])).toEqual([]);
  await page.getByRole("button", { name: "Fermer la salle", exact: true }).click();
  await page.getByRole("button", { name: "Oui, fermer la salle", exact: true }).click();
  await expect.poll(async () => (await query("select id from guest_sessions where id=$1", [guestId])).length).toBe(0);
  expect(await query("select * from race_results where race_id=$1 order by entrant_id", [race.id])).toEqual(results);
});

for (const locale of ["fr-CA", "en-US"]) for (const theme of ["abysse", "aube"]) {
  test(`guest entry and room accessibility: ${locale}, ${theme}`, async ({ browser }) => {
    const host = await hostRoom(browser);
    const { page } = await visitor(browser, locale, theme);
    await fillGuest(page, host.code, "Noa Marin");
    for (const width of [360, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
      await page.screenshot({ path: `/tmp/guest-entry-${locale}-${theme}-${width}.png`, fullPage: true });
    }
    await enter(page); await live(page);
    for (const width of [360, 390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
      await page.screenshot({ path: `/tmp/guest-room-${locale}-${theme}-${width}.png`, fullPage: true });
    }
  });
}
