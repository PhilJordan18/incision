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
      for (const width of [1440, 1024, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
        const row = panel(page).getByRole("listitem");
        const select = await row.getByRole("combobox").boundingBox();
        const change = await row.getByRole("button", { name: /^(Changer le niveau|Change level)$/ }).boundingBox();
        const remove = await row.getByRole("button", { name: /^(Retirer|Remove) Bot 1$/ }).boundingBox();
        if (!select || !change || !remove) throw new Error("Missing bot controls");
        for (const control of [select, change, remove]) expect(control.height).toBeGreaterThanOrEqual(44);
        expect(remove.height).toBeCloseTo(change.height, 0);
        if (width >= 1024) {
          expect(Math.abs(remove.y + remove.height - select.y - select.height)).toBeLessThan(1);
          expect(Math.abs(remove.y - change.y)).toBeLessThan(1);
        }
        await page.screenshot({ path: `../../docs/evidence/f05-2-bot-controls-alignment/${locale}-${theme}-${width}.png`, fullPage: true });
      }
    }
    const row = panel(page).getByRole("listitem");
    await row.getByRole("combobox").focus(); await page.keyboard.press("Tab");
    await expect(row.getByRole("button", { name: /^(Changer le niveau|Change level)$/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(row.getByRole("button", { name: /^(Retirer|Remove) Bot 1$/ })).toBeFocused();
    const selector = panel(page).getByRole("combobox", { name: /^(Niveau du bot|Bot level)$/ });
    await selector.focus(); await selector.press("Tab");
    await expect(panel(page).getByRole("button", { name: /^(Ajouter un bot|Add a bot)$/ })).toBeFocused();
  }
});
