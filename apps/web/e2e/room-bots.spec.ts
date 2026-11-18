import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id = null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });
async function account(browser: Browser, locale = "fr-CA") {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('BotHost') returning id, session_version");
  if (!row) throw new Error("fixture account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return { page: await context.newPage(), context };
}
async function open(page: Page) {
  await page.goto("/rooms/new"); await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  return page.url().split("/").at(-1)!;
}
const panel = (page: Page) => page.getByRole("region", { name: "Bots", exact: true });

test("host adds, changes and removes a bot; another member sees persisted updates but no controls", async ({ browser }) => {
  const { page: host } = await account(browser); const { page: member } = await account(browser);
  const code = await open(host);
  await member.goto(`/rooms/${code}`); await member.getByRole("button", { name: "Rejoindre la salle", exact: true }).click();
  await expect(member.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(panel(member).getByRole("button")).toHaveCount(0);
  await panel(host).getByRole("combobox", { name: "Niveau du bot", exact: true }).selectOption("expert");
  await panel(host).getByRole("button", { name: "Ajouter un bot" }).click();
  await expect(panel(member).getByRole("listitem")).toContainText("Empereur des mers — expert");
  await expect(panel(host).getByRole("button", { name: "Ajouter un bot" })).toBeEnabled();
  await panel(host).getByRole("button", { name: "Modifier Bot 1", exact: true }).click();
  await panel(host).getByRole("combobox", { name: "Niveau du bot 1", exact: true }).selectOption("noob");
  await panel(host).getByRole("button", { name: "Changer le niveau" }).click();
  await expect(panel(member).getByRole("listitem")).toContainText("Mousse — novice");
  await host.reload(); await expect(host.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(panel(host).getByRole("listitem")).toContainText("Mousse — novice");
  await panel(host).getByRole("button", { name: "Retirer Bot 1", exact: true }).click();
  await expect(panel(member).getByRole("listitem")).toHaveCount(0);
  await expect(panel(host).getByRole("button", { name: "Ajouter un bot" })).toBeEnabled();
  await expect(panel(host).getByRole("button", { name: "Ajouter un bot" })).toBeFocused();
  const [counts] = await query<{ count: string }>("select count(*) from lobby_bots b join lobbies l on b.lobby_id = l.id where l.code = $1", [code]);
  expect(counts?.count).toBe("0");
});

test("bots consume places and an explicit reload recovers after a full-room refusal", async ({ browser }) => {
  const { page } = await account(browser); const code = await open(page);
  // Fixture only narrows room capacity; additions still go through the authenticated action.
  await query("update lobbies set capacity = 2 where code = $1", [code]);
  await page.reload(); await expect(page.getByText("[.En direct]", { exact: true })).toBeVisible();
  await panel(page).getByRole("button", { name: "Ajouter un bot" }).click();
  await expect(panel(page).getByRole("listitem")).toHaveCount(1);
  await expect(panel(page).getByRole("button", { name: "Ajouter un bot" })).toBeEnabled();
  await panel(page).getByRole("button", { name: "Ajouter un bot" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("La salle est complète");
  await expect(panel(page).getByRole("listitem")).toHaveCount(1);
  await panel(page).getByRole("button", { name: "Recharger la salle" }).click();
  await panel(page).getByRole("button", { name: "Retirer Bot 1" }).click();
  await expect(panel(page).getByRole("listitem")).toHaveCount(0);
});

test("bot controls are accessible in both languages and themes at reference widths", async ({ browser }) => {
  for (const locale of ["fr-CA", "en-US"]) {
    const { page } = await account(browser, locale); await open(page);
    await panel(page).getByRole("combobox").selectOption("impossible");
    await panel(page).getByRole("button", { name: /^(Ajouter un bot|Add a bot)$/ }).click();
    await expect(panel(page).getByRole("listitem")).toHaveCount(1);
    for (const theme of ["abysse", "aube"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      // The live label must not interpolate its foreground against an independently
      // transitioning ancestor background, including with reduced motion enabled.
      const live = page.getByText(/^\[\.(En direct|Live)\]$/);
      await expect(live).toHaveCSS("transition-property", "none");
      expect(await live.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
      for (const width of [1440, 1024, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
        const row = panel(page).getByRole("listitem");
        // Second layout (DA2-5b): the line's two actions sit side by side; the editor opens under them.
        const toggle = row.getByRole("button", { name: /^(Modifier|Edit) Bot 1$|^(Annuler :|Cancel:) Bot 1$/ });
        if (await toggle.getAttribute("aria-expanded") === "false") await toggle.click();
        const select = await row.getByRole("combobox").boundingBox();
        const change = await row.getByRole("button", { name: /^(Changer le niveau|Change level)$/ }).boundingBox();
        const remove = await row.getByRole("button", { name: /^(Retirer|Remove) Bot 1$/ }).boundingBox();
        const cancel = await toggle.boundingBox();
        if (!select || !change || !remove || !cancel) throw new Error("Missing bot controls");
        for (const control of [select, change, remove, cancel]) expect(control.height).toBeGreaterThanOrEqual(44);
        expect(remove.height).toBeCloseTo(cancel.height, 0);
        expect(Math.abs(remove.y - cancel.y)).toBeLessThan(1);
        expect(select.y).toBeGreaterThanOrEqual(remove.y + remove.height);
        if (width >= 1024) {
          expect(Math.abs(change.y + change.height - select.y - select.height)).toBeLessThan(1);
          expect(change.x).toBeGreaterThanOrEqual(select.x + select.width);
        }
        // The F-05.2 captures stay as delivered (docs/evidence/f05-2-bot-controls-alignment); the second layout has its own.
        await page.screenshot({ path: test.info().outputPath(`${locale}-${theme}-${width}.png`), fullPage: true });
      }
    }
    const row = panel(page).getByRole("listitem");
    // Keyboard order follows the line: its two actions, then the editor it opened.
    await row.getByRole("button", { name: /^(Annuler :|Cancel:) Bot 1$/ }).focus(); await page.keyboard.press("Tab");
    await expect(row.getByRole("button", { name: /^(Retirer|Remove) Bot 1$/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(row.getByRole("combobox")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(row.getByRole("button", { name: /^(Changer le niveau|Change level)$/ })).toBeFocused();
    const selector = panel(page).getByRole("combobox", { name: /^(Niveau du bot|Bot level)$/ });
    await selector.focus(); await selector.press("Tab");
    await expect(panel(page).getByRole("button", { name: /^(Ajouter un bot|Add a bot)$/ })).toBeFocused();
  }
});

for (const locale of ["fr-CA", "en-US"]) test(`new bot choices, saved roster and unsaved edits stay distinct (${locale})`, async ({ browser }) => {
  const { page } = await account(browser, locale); await open(page);
  const bots = panel(page);
  const add = bots.getByRole("button", { name: /^(Ajouter un bot|Add a bot)$/ });
  const nextLevel = bots.getByRole("combobox", { name: /^(Niveau du bot|Bot level)$/ });
  await expect(bots.getByRole("heading", { name: /^(Ajouter un bot|Add a bot)$/ })).toBeVisible();
  await expect(bots.getByRole("heading", { name: /^(Bots dans la salle|Bots in the room)$/ })).toBeVisible();
  await nextLevel.selectOption("expert"); await add.click();
  await expect(bots.getByRole("status").filter({ hasText: /^(Bot ajouté à la salle.|Bot added to the room.)$/ })).toBeVisible();
  const first = bots.getByRole("listitem").nth(0);
  await first.getByRole("button", { name: /^(Modifier|Edit) Bot 1$/ }).click();
  await first.getByRole("combobox").selectOption("noob");
  await expect(first.getByText(/^(Niveau enregistré :|Saved level:)/)).toContainText(/expert/);
  await expect(first.getByRole("status")).toContainText(/(Modification non enregistrée|Unsaved change)/);
  await nextLevel.selectOption("impossible");
  await expect(first.getByRole("combobox")).toHaveValue("noob");
  await first.getByRole("button", { name: /^(Changer le niveau|Change level)$/ }).click();
  await expect(bots.getByRole("status").filter({ hasText: /^(Niveau du bot enregistré.|Bot level saved.)$/ })).toBeVisible();
  await expect(first.getByText(/^(Niveau enregistré :|Saved level:)/)).toContainText(/novice/);
  await expect(nextLevel).toHaveValue("impossible");
  // The saved line closed by itself; the level it shows is the saved one.
  await expect(first.getByRole("combobox")).toHaveCount(0);
  await expect(first.getByRole("button", { name: /^(Modifier|Edit) Bot 1$/ })).toHaveAttribute("aria-expanded", "false");
  await add.click(); await expect(bots.getByRole("listitem")).toHaveCount(2);
  await expect(first.getByText(/^(Niveau enregistré :|Saved level:)/)).toContainText(/novice/);
  await expect(bots.getByRole("listitem").nth(1).getByText(/^(Niveau enregistré :|Saved level:)/)).toContainText(/impossible/);
  await page.reload(); await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  await expect(first.getByText(/^(Niveau enregistré :|Saved level:)/)).toContainText(/novice/);
  await expect(bots.getByRole("listitem").nth(1).getByText(/^(Niveau enregistré :|Saved level:)/)).toContainText(/impossible/);
});

// DA2-5b: one line per bot, its editor on demand.
async function roomWithBots(host: Page, count: number) {
  const code = await open(host);
  const levels = ["intermediate", "noob", "expert", "beginner", "beginner", "intermediate", "impossible", "noob", "expert", "intermediate"];
  // Roster fixture only; every change under test goes through the page.
  for (let index = 0; index < count; index++) await query("insert into lobby_bots(lobby_id, level) select id, $2 from lobbies where code = $1", [code, levels[index % levels.length]]);
  await host.reload(); await expect(host.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  await expect(panel(host).getByRole("listitem")).toHaveCount(count);
  return code;
}
const line = (page: Page, index: number) => panel(page).getByRole("listitem").nth(index - 1);
const savedLevels = (code: string) => query<{ level: string }>("select b.level from lobby_bots b join lobbies l on b.lobby_id = l.id where l.code = $1 order by b.created_at, b.id", [code]);

test("« Modifier » opens the level on demand and moves focus to it; « Annuler » discards and gives focus back", async ({ browser }) => {
  const { page } = await account(browser); const code = await roomWithBots(page, 2);
  const first = line(page, 1);
  const edit = first.getByRole("button", { name: "Modifier Bot 1", exact: true });
  // Closed: insignia, name, saved level and the two actions; no select, nothing to save.
  await expect(first).toContainText("Bot 1"); await expect(first).toContainText("Niveau enregistré : Capitaine — intermédiaire");
  await expect(first.getByRole("button")).toHaveText(["Modifier", "Retirer"]);
  await expect(edit).toHaveAttribute("aria-expanded", "false");
  await expect(panel(page).getByRole("combobox")).toHaveCount(1); // the add block's only
  await edit.focus(); await page.keyboard.press("Enter");
  const select = first.getByRole("combobox", { name: "Niveau du bot 1", exact: true });
  await expect(select).toBeFocused();
  const cancel = first.getByRole("button", { name: "Annuler : Bot 1", exact: true });
  await expect(cancel).toHaveAttribute("aria-expanded", "true");
  await expect(first.getByRole("status")).toHaveText("Aucune modification en attente.");
  // A clean editor has nothing to save: the button says so and sends nothing.
  await expect(first.getByRole("button", { name: "Changer le niveau" })).toHaveAttribute("aria-disabled", "true");
  await select.selectOption("impossible");
  await expect(first.getByRole("status")).toHaveText("⚠ Modification non enregistrée : Roi des pirates — impossible. Choisis « Changer le niveau » pour enregistrer.");
  await expect(first.getByText("Non enregistré", { exact: true })).toBeVisible();
  await expect(first).toContainText("Niveau enregistré : Capitaine — intermédiaire");
  await cancel.click();
  await expect(edit).toBeFocused(); await expect(edit).toHaveAttribute("aria-expanded", "false");
  await expect(first.getByRole("combobox")).toHaveCount(0);
  await expect(first.getByText("Non enregistré", { exact: true })).toHaveCount(0);
  // Reopened, the discarded choice is gone; nothing reached the server.
  await edit.click();
  await expect(select).toHaveValue("intermediate");
  expect((await savedLevels(code)).map((bot) => bot.level)).toEqual(["intermediate", "noob"]);
});

test("unsaved lines never close by themselves: other lines, a save next to them and room updates keep them", async ({ browser }) => {
  const { page: host } = await account(browser); const { page: member } = await account(browser);
  const code = await roomWithBots(host, 3);
  await line(host, 1).getByRole("button", { name: "Modifier Bot 1", exact: true }).click();
  await line(host, 1).getByRole("combobox").selectOption("expert");
  // Opening another line leaves the first open, with its draft.
  await line(host, 3).getByRole("button", { name: "Modifier Bot 3", exact: true }).click();
  await line(host, 3).getByRole("combobox").selectOption("noob");
  await line(host, 2).getByRole("button", { name: "Modifier Bot 2", exact: true }).click();
  await expect(panel(host).getByText("Non enregistré", { exact: true })).toHaveCount(2);
  await expect(line(host, 1).getByRole("combobox")).toHaveValue("expert");
  // A realtime room update (someone joins) keeps every open line and draft.
  await member.goto(`/rooms/${code}`); await member.getByRole("button", { name: "Rejoindre la salle", exact: true }).click();
  await expect(member.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(host.getByRole("region", { name: "Équipage" }).getByRole("listitem")).toHaveCount(2);
  await expect(line(host, 1).getByRole("combobox")).toHaveValue("expert");
  await expect(line(host, 3).getByRole("combobox")).toHaveValue("noob");
  await expect(line(host, 2).getByRole("status")).toHaveText("Aucune modification en attente.");
  // Saving one line saves that line only; the other draft stays open and unsaved.
  await line(host, 3).getByRole("button", { name: "Changer le niveau" }).click();
  await expect(panel(host).getByRole("status").filter({ hasText: /^Niveau du bot enregistré\.$/ })).toBeVisible();
  await expect(line(member, 3)).toContainText("Mousse — novice");
  await expect(line(host, 3).getByRole("combobox")).toHaveCount(0);
  await expect(line(host, 3).getByRole("button", { name: "Modifier Bot 3", exact: true })).toBeFocused();
  await expect(line(host, 1).getByRole("combobox")).toHaveValue("expert");
  await expect(line(host, 1).getByRole("status")).toContainText("Modification non enregistrée : Empereur des mers — expert.");
  await expect(line(member, 1)).toContainText("Capitaine — intermédiaire");
  expect((await savedLevels(code)).map((bot) => bot.level)).toEqual(["intermediate", "noob", "noob"]);
  // The non-host reads the same lines without any control.
  await expect(panel(member).getByRole("button")).toHaveCount(0);
  await line(host, 1).getByRole("button", { name: "Changer le niveau" }).click();
  await expect(line(member, 1)).toContainText("Empereur des mers — expert");
});

test("a server refusal shows on the line it concerns and keeps the draft", async ({ browser }) => {
  const { page } = await account(browser); const code = await roomWithBots(page, 3);
  await line(page, 2).getByRole("button", { name: "Modifier Bot 2", exact: true }).click();
  await line(page, 2).getByRole("combobox").selectOption("impossible");
  await line(page, 3).getByRole("button", { name: "Modifier Bot 3", exact: true }).click();
  await line(page, 3).getByRole("combobox").selectOption("beginner");
  // Fixture: the room moved on without telling this page, so its revision is stale.
  await query("update lobbies set revision = revision + 1 where code = $1", [code]);
  await line(page, 2).getByRole("button", { name: "Changer le niveau" }).click();
  await expect(line(page, 2).getByRole("alert")).toHaveText("⚠ La salle a changé. Recharge-la avant de réessayer.");
  await expect(panel(page).getByRole("alert")).toHaveCount(1);
  await expect(line(page, 2).getByRole("combobox")).toHaveValue("impossible");
  await expect(line(page, 2).getByText("Non enregistré", { exact: true })).toBeVisible();
  await expect(line(page, 3).getByRole("combobox")).toHaveValue("beginner");
  // As before: nothing else is sent until the room is read again.
  await expect(line(page, 2).getByRole("combobox")).toBeDisabled();
  await expect(panel(page).getByRole("button", { name: "Ajouter un bot" })).toBeDisabled();
  expect((await savedLevels(code)).map((bot) => bot.level)).toEqual(["intermediate", "noob", "expert"]);
  await line(page, 2).getByRole("button", { name: "Recharger la salle" }).click();
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
  await expect(line(page, 2).getByRole("combobox")).toBeEnabled();
  await expect(line(page, 2).getByRole("combobox")).toHaveValue("impossible");
  await expect(line(page, 3).getByRole("combobox")).toHaveValue("beginner");
  await line(page, 2).getByRole("button", { name: "Changer le niveau" }).click();
  await expect(line(page, 2)).toContainText("Niveau enregistré : Roi des pirates — impossible");
  expect((await savedLevels(code)).map((bot) => bot.level)).toEqual(["intermediate", "impossible", "expert"]);
});

test("a concurrent level from a second tab replaces that line's stale draft and leaves the other drafts", async ({ browser }) => {
  const { page: first, context } = await account(browser); const code = await roomWithBots(first, 2);
  const second = await context.newPage(); await second.goto(`/rooms/${code}`);
  await expect(second.getByText("[.En direct]", { exact: true })).toBeVisible();
  await line(first, 1).getByRole("button", { name: "Modifier Bot 1", exact: true }).click();
  await line(first, 1).getByRole("combobox").selectOption("expert");
  await line(first, 2).getByRole("button", { name: "Modifier Bot 2", exact: true }).click();
  await line(first, 2).getByRole("combobox").selectOption("impossible");
  await line(second, 1).getByRole("button", { name: "Modifier Bot 1", exact: true }).click();
  await line(second, 1).getByRole("combobox").selectOption("beginner");
  await line(second, 1).getByRole("button", { name: "Changer le niveau" }).click();
  // The existing stale rule: the confirmed level replaces this line's draft; the line stays open.
  await expect(line(first, 1)).toContainText("Niveau enregistré : Quartier-maître — débutant");
  await expect(line(first, 1).getByRole("combobox")).toHaveValue("beginner");
  await expect(line(first, 1).getByRole("status")).toHaveText("Aucune modification en attente.");
  await expect(line(first, 2).getByRole("combobox")).toHaveValue("impossible");
  await expect(line(first, 2).getByText("Non enregistré", { exact: true })).toBeVisible();
});

test("a lost connection disables the editors, keeps the drafts and still lets a line be cancelled", async ({ browser }) => {
  const { page, context } = await account(browser); await roomWithBots(page, 2);
  await line(page, 1).getByRole("button", { name: "Modifier Bot 1", exact: true }).click();
  await line(page, 1).getByRole("combobox").selectOption("expert");
  await line(page, 2).getByRole("button", { name: "Modifier Bot 2", exact: true }).click();
  await context.setOffline(true);
  await expect(panel(page).getByText("Attends la reconnexion avant de modifier les bots.")).toBeVisible({ timeout: 30_000 });
  await expect(line(page, 1).getByRole("combobox")).toBeDisabled();
  await expect(line(page, 1).getByRole("combobox")).toHaveValue("expert");
  await line(page, 2).getByRole("button", { name: "Annuler : Bot 2", exact: true }).click();
  await expect(line(page, 2).getByRole("button", { name: "Modifier Bot 2", exact: true })).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByText("[.En direct]", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(line(page, 1).getByRole("combobox")).toBeEnabled();
  await expect(line(page, 1).getByRole("combobox")).toHaveValue("expert");
});

for (const locale of ["fr-CA", "en-US"]) test(`ten bots stay one line each and accessible, open or closed (${locale})`, async ({ browser }) => {
  const { page } = await account(browser, locale); await roomWithBots(page, 10);
  await line(page, 2).getByRole("button", { name: /^(Modifier|Edit) Bot 2$/ }).click();
  await line(page, 2).getByRole("combobox").selectOption("expert");
  await line(page, 7).getByRole("button", { name: /^(Modifier|Edit) Bot 7$/ }).click();
  await expect(line(page, 2).getByText(/^(Non enregistré|Unsaved)$/)).toBeVisible();
  for (const theme of ["abysse", "aube"]) {
    await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const width of [1440, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
      // A closed line is one row of controls: its two actions share a line at every width.
      const closed = line(page, 1);
      const edit = await closed.getByRole("button", { name: /^(Modifier|Edit) Bot 1$/ }).boundingBox();
      const remove = await closed.getByRole("button", { name: /^(Retirer|Remove) Bot 1$/ }).boundingBox();
      const box = await closed.boundingBox();
      if (!edit || !remove || !box) throw new Error("Missing bot line");
      expect(Math.abs(edit.y - remove.y)).toBeLessThan(1);
      for (const control of [edit, remove]) expect(control.height).toBeGreaterThanOrEqual(44);
      if (width === 1440) expect(box.height).toBeLessThanOrEqual(72);
    }
  }
});
