import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { connectSocket, expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function visitor(browser: Browser, locale: string, javaScriptEnabled = true): Promise<Page> {
  const context = await browser.newContext({ locale, reducedMotion: "reduce", javaScriptEnabled }); contexts.push(context);
  return context.newPage();
}
async function account(browser: Browser, name: string, locale: string) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id,session_version", [name]);
  if (!row) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return { page: await context.newPage(), accountId: row.id };
}
const live = /^\[\.(En direct|Live)\]$/;
const label = { private: /^(Privée|Private)$/, code: /^(Sur code|By code)$/, public: /^(Publique|Public)$/ };

async function openRoom(page: Page, visibility: keyof typeof label): Promise<string> {
  await page.goto("/rooms/new");
  await page.getByRole("group", { name: /^(Accès|Access)$/ }).getByRole("radio", { name: label[visibility] }).check();
  await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(page.getByText(live)).toBeVisible();
  return page.url().split("/").at(-1)!;
}
/** The chips hide their radio visually: a person clicks the label. */
async function chip(group: Locator, name: RegExp): Promise<void> {
  await group.locator("label").filter({ has: group.page().getByRole("radio", { name }) }).click();
  await expect(group.getByRole("radio", { name })).toBeChecked();
}
function rows(page: Page) { return page.getByRole("list").filter({ has: page.getByRole("term") }).getByRole("listitem"); }
function row(page: Page, code: string) { return rows(page).filter({ hasText: code }); }

async function applySystemTheme(page: Page, colorScheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme === "light" ? "aube" : "abysse");
}
async function auditEveryLayout(page: Page, name: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await applySystemTheme(page, theme);
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
  test(`lists public rooms live, never code or private ones, and follows changes (${locale})`, async ({ browser }) => {
    test.slow();
    const watcher = await visitor(browser, locale);
    await watcher.goto("/rooms");
    await expect(watcher.getByText(/^(La liste se met à jour en direct\.|The list updates live\.)$/)).toBeVisible();
    // The hook above deletes rooms in SQL, which no event announces: the feed's 15 s refresh
    // catches it, as it does for changes made by another process.
    await expect(watcher.getByText(/^(Aucune salle publique ouverte pour l’instant\.|No public room is open right now\.)$/)).toBeVisible({ timeout: 20_000 });

    const host = await account(browser, "Julie Explorer", locale);
    const hidden = await account(browser, "Hidden host", locale);
    const joiner = await account(browser, "Joiner", locale);
    const code = await openRoom(host.page, "public");
    const codeRoom = await openRoom(hidden.page, "code");

    // Without reloading: the public room appears with its data; the code room never does.
    const entry = row(watcher, code);
    await expect(entry).toBeVisible();
    await expect(entry).toContainText("Julie Explorer");
    await expect(entry).toContainText("1 / 30");
    await expect(entry).toContainText(/(En attente|Waiting)/);
    await expect(entry).toContainText(/(Entraînement|Training)/);
    await expect(row(watcher, codeRoom)).toHaveCount(0);
    await expect(watcher.getByText(codeRoom)).toHaveCount(0);
    await expect(watcher.getByText("Hidden host")).toHaveCount(0);

    // Joining from the list goes through the room's own admission; the count follows live.
    const join = entry.getByRole("link", { name: new RegExp(`^(Rejoindre la salle|Join room) ${code}$`) });
    await expect(join).toHaveAttribute("href", `/rooms/${code}`);
    await joiner.page.goto("/rooms");
    await row(joiner.page, code).getByRole("link", { name: new RegExp(code) }).click();
    await joiner.page.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
    await expect(joiner.page.getByText(live)).toBeVisible();
    await expect(entry).toContainText("2 / 30");

    await expect(watcher.getByRole("link", { name: /^(Jouer|Play)$/ })).toHaveAttribute("aria-current", "page");
    await auditEveryLayout(watcher, `explorer-${locale}`);

    // A race keeps the room listed, without a way in.
    await host.page.getByRole("button", { name: /^(Lancer la course|Start the race)$/ }).click();
    await expect(entry).toContainText(/(Départ|Starting|En course|Racing)/);
    await expect(entry.getByRole("link")).toHaveCount(0);
    await expect(entry).toContainText(/(Course en cours|Race in progress)/);
  });

  test(`a page that connects late or reconnects gets the current list from its watch (${locale})`, async ({ browser }) => {
    const watcher = await visitor(browser, locale);
    // The page renders from the server, but its socket cannot connect yet.
    await watcher.route("**/socket.io/**", (route) => route.abort());
    await watcher.goto("/rooms");
    await expect(watcher.getByRole("heading", { name: /^(Salles publiques|Public rooms)/ })).toBeVisible();
    await expect(watcher.getByText(/^(La liste se met à jour en direct\.|The list updates live\.)$/)).toHaveCount(0);
    const host = await account(browser, "Late host", locale);
    const code = await openRoom(host.page, "public");
    // Nobody else watches, so no broadcast carries the room: only the watch answer can.
    await watcher.unroute("**/socket.io/**");
    await expect(row(watcher, code)).toBeVisible({ timeout: 15_000 });
    await expect(watcher.getByText(/^(La liste se met à jour en direct\.|The list updates live\.)$/)).toBeVisible();
  });

  test(`a room leaves the list when it stops being public (${locale})`, async ({ browser }) => {
    const watcher = await visitor(browser, locale);
    const host = await account(browser, "Switching host", locale);
    const code = await openRoom(host.page, "public");
    await watcher.goto("/rooms");
    await expect(row(watcher, code)).toBeVisible();
    const panel = host.page.getByRole("region", { name: /^(Visibilité de la salle|Room visibility)$/ });
    await panel.getByRole("button", { name: /^(Modifier la visibilité|Edit visibility)$/ }).click();
    await panel.getByRole("radio", { name: label.private }).check();
    await panel.getByRole("button", { name: /^(Enregistrer la visibilité|Save visibility)$/ }).click();
    await expect(row(watcher, code)).toHaveCount(0);
    await expect(watcher.getByText(code)).toHaveCount(0);
  });

  test(`filters by language and complexity, with the keyboard and without JavaScript (${locale})`, async ({ browser }) => {
    const french = await account(browser, "French host", locale);
    const english = await account(browser, "English host", locale);
    const frCode = await openRoom(french.page, "public");
    const enCode = await openRoom(english.page, "public");
    await query("update lobby_settings set text_language='en', complexity='hard', bonuses_enabled=true where lobby_id=(select id from lobbies where code=$1)", [enCode]);
    await query("update lobby_settings set text_language='fr', complexity='easy' where lobby_id=(select id from lobbies where code=$1)", [frCode]);

    const page = await visitor(browser, locale);
    await page.goto("/rooms");
    await expect(row(page, enCode)).toContainText(/Arcade/);
    await expect(row(page, frCode)).not.toContainText(/Arcade/);
    const language = page.getByRole("group", { name: /^(Langue du texte|Text language)$/ });
    await language.getByRole("radio", { name: /^(Toutes|All)$/ }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(language.getByRole("radio", { name: /^(Français|French)$/ })).toBeChecked();
    await expect(page).toHaveURL(/\?language=fr$/);
    await expect(row(page, frCode)).toBeVisible();
    await expect(row(page, enCode)).toHaveCount(0);
    await expect(page.getByRole("status")).toContainText(/(1 salle affichée sur 2\.|Showing 1 of 2 rooms\.)/);
    await chip(page.getByRole("group", { name: /^(Complexité|Complexity)$/ }), /^(Difficile|Hard)$/);
    await expect(page.getByText(/^(Aucune salle publique ne correspond à ces filtres\.|No public room matches these filters\.)$/)).toBeVisible();
    await page.getByRole("link", { name: /^(Voir toutes les salles|Show every room)$/ }).click();
    await expect(rows(page)).toHaveCount(2);

    const noScript = await visitor(browser, locale, false);
    await noScript.goto("/rooms");
    await chip(noScript.getByRole("group", { name: /^(Langue du texte|Text language)$/ }), /^(Anglais|English)$/);
    await noScript.getByRole("button", { name: /^(Appliquer les filtres|Apply filters)$/ }).click();
    await expect(noScript).toHaveURL(/language=en/);
    await expect(row(noScript, enCode)).toBeVisible();
    await expect(row(noScript, frCode)).toHaveCount(0);
  });
}

test("the explorer socket carries only public rooms, never ids, members or other rooms", async ({ browser }) => {
  const host = await account(browser, "Payload host", "fr-CA");
  const other = await account(browser, "Private payload host", "fr-CA");
  const code = await openRoom(host.page, "public");
  const privateCode = await openRoom(other.page, "private");
  const { socket, error } = await connectSocket(test.info().project.use.baseURL ?? "");
  expect(error).toBeUndefined();
  try {
    const ack = await socket.timeout(5_000).emitWithAck("publicRooms:watch", null) as { ok: boolean; rooms: Record<string, unknown>[] };
    expect(ack.ok).toBe(true);
    expect(ack.rooms.map((room) => room.code)).toEqual([code]);
    expect(Object.keys(ack.rooms[0]!).sort()).toEqual(
      ["arcade", "capacity", "code", "complexity", "hostName", "joinable", "participants", "phase", "textKind", "textLanguage", "wordCount"]);
    const serialized = JSON.stringify(ack);
    for (const leak of [privateCode, "Private payload host", host.accountId, other.accountId]) expect(serialized).not.toContain(leak);
  } finally { socket.close(); }
});
