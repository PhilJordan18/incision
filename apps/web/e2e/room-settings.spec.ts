import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function account(browser: Browser, name: string, locale = "fr-CA") {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [name]);
  if (row === undefined) throw new Error("Missing test account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" });
  contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return { context, page: await context.newPage() };
}
async function open(page: Page) {
  await page.goto("/rooms/new");
  await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  return page.url().split("/").at(-1) ?? "";
}
const panel = (page: Page) => page.getByRole("region", { name: /^(Réglages de la course|Race settings)$/ });
async function edit(page: Page, language: "fr" | "en", seconds: string) {
  await panel(page).getByRole("button", { name: /^(Modifier les réglages|Edit settings)$/ }).click();
  await panel(page).getByRole("combobox").selectOption(language);
  await panel(page).getByRole("spinbutton").fill(seconds);
}
async function save(page: Page) {
  await panel(page).getByRole("button", { name: /^(Enregistrer les réglages|Save settings)$/ }).click();
  await expect(panel(page).getByRole("status")).toHaveText(/^(Réglages enregistrés\.|Settings saved\.)$/);
}

test("saved language and duration reach another member, survive reload and govern the real start", async ({ browser }) => {
  const { page: host } = await account(browser, "SettingsHost");
  const { page: member } = await account(browser, "SettingsMember");
  const code = await open(host);
  await member.goto(`/rooms/${code}`);
  await member.getByRole("button", { name: "Rejoindre la salle", exact: true }).click();
  await expect(member.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(panel(member).getByRole("button", { name: "Modifier les réglages" })).toHaveCount(0);
  await edit(host, "en", "60");
  await expect(panel(host).locator("dd").first()).toHaveText("Français"); // no optimistic summary
  await save(host);
  await expect(panel(member).locator("dd").first()).toHaveText("Anglais");
  await expect(panel(member).locator("dd").nth(1)).toHaveText("60");
  await host.reload();
  await expect(host.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(panel(host).locator("dd").nth(1)).toHaveText("60");
  await expect(host.locator("#start-note")).toContainText("60 s");
  await host.getByRole("button", { name: "Lancer la course", exact: true }).click();
  await expect(host.locator(".course-texte")).toBeVisible({ timeout: 10_000 });
  await expect(panel(host)).toHaveCount(0);
  const [race] = await query<{ text: string; config: Record<string, unknown> }>(
    "select text_snapshot as text, config_snapshot as config from races r join lobbies l on l.current_race_id = r.id where l.code = $1", [code]);
  expect(race?.config).toMatchObject({ language: "en", timeLimitMs: 60_000, errorMode: "mandatory" });
  expect(await host.locator(".course-texte").textContent()).toBe(race?.text);
  if (process.env.E2E_SETTINGS_CORPUS !== undefined) {
    expect(race?.config.corpusVersion).toBe(process.env.E2E_SETTINGS_CORPUS);
    expect(race?.config.text).not.toBe("fixture");
    expect(race?.text.split(" ")).toHaveLength(50);
  } else {
    expect(race?.config.text).toBe("fixture");
  }
  // Finish through the normal confirmed-abandon path; the next round retains settings.
  for (const page of [host, member]) {
    await expect(page.getByLabel("Ta frappe")).toBeEnabled({ timeout: 6_000 });
    await page.getByRole("button", { name: "Abandonner la course", exact: true }).click();
    await page.getByRole("button", { name: "Oui, abandonner", exact: true }).click();
  }
  await host.getByRole("button", { name: "Prochaine manche", exact: true }).click();
  await expect(panel(host).locator("dd").first()).toHaveText("Anglais");
  await expect(panel(host).locator("dd").nth(1)).toHaveText("60");
  await expect(panel(member).locator("dd").nth(1)).toHaveText("60");
});

test("another host tab cannot silently overwrite a draft; cancel and explicit reload restore focus", async ({ browser }) => {
  const { page: first, context } = await account(browser, "SettingsTabs");
  const code = await open(first);
  const second = await context.newPage();
  await second.goto(`/rooms/${code}`);
  await expect(second.getByText("[.En direct]", { exact: true })).toBeVisible();
  await edit(first, "en", "45");
  await edit(second, "fr", "90");
  await save(second);
  await expect(panel(first).getByRole("alert")).toContainText("autre onglet");
  await expect(panel(first).getByRole("spinbutton")).toHaveValue("45");
  await expect(panel(first).getByRole("button", { name: "Enregistrer les réglages" })).toBeDisabled();
  await panel(first).getByRole("button", { name: "Recharger les réglages" }).click();
  await expect(first.getByText("[.En direct]", { exact: true })).toBeVisible();
  await edit(first, "en", "60");
  await panel(first).getByRole("combobox").press("Escape");
  await expect(panel(first).getByRole("button", { name: "Modifier les réglages" })).toBeFocused();
  await expect(panel(first).locator("dd").nth(1)).toHaveText("90");
  await edit(first, "en", "60");
  await save(first);
  await expect(panel(second).locator("dd").nth(1)).toHaveText("60");
});

test("settings remain accessible in both languages and themes at reference widths", async ({ browser }) => {
  for (const locale of ["fr-CA", "en-US"]) {
    const { page, context } = await account(browser, `Settings${locale}`, locale);
    await open(page);
    for (const theme of ["abysse", "aube"]) {
      await context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL ?? "" }]);
      await page.reload();
      await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      await edit(page, "en", "60");
      for (const width of [1440, 1024, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        await expectNoHorizontalScroll(page);
        await page.screenshot({ path: test.info().outputPath(`settings-${locale}-${theme}-${width}.png`), fullPage: true });
      }
      await expectNoAccessibilityViolation(page);
      await panel(page).getByRole("button", { name: /^(Annuler|Cancel)$/ }).click();
    }
  }
});

test("a lost action response preserves the draft and offers a read, not an automatic retry", async ({ browser }) => {
  const { page } = await account(browser, "SettingsOffline");
  await open(page);
  await edit(page, "en", "45");
  let actions = 0;
  await page.route("**/rooms/*", async (route) => {
    if (route.request().headers()["next-action"] !== undefined) {
      actions += 1;
      await route.abort("failed");
    } else await route.continue();
  });
  await panel(page).getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(panel(page).getByRole("alert")).toContainText("confirmation n’a pas été reçue");
  await expect(panel(page).getByRole("spinbutton")).toHaveValue("45");
  await expect(panel(page).getByRole("button", { name: "Enregistrer les réglages" })).toBeDisabled();
  expect(actions).toBe(1);
  await panel(page).getByRole("button", { name: "Annuler", exact: true }).click();
  await expect(panel(page).getByRole("button", { name: "Modifier les réglages" })).toHaveAttribute("aria-disabled", "true");
  await expect(panel(page).getByRole("alert")).toContainText("confirmation n’a pas été reçue");
  await page.unroute("**/rooms/*");
  await panel(page).getByRole("button", { name: "Recharger les réglages" }).click();
  await expect(page.getByText("[.En direct]", { exact: true })).toBeVisible();
  await edit(page, "en", "45");
  await save(page);
});
