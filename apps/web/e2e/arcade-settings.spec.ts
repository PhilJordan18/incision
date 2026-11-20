import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * CONF-09 and D-18 (C3): the host chooses Arcade (bonuses on) or training (off); every member sees
 * it, it survives reload and the race freezes it. The bonus effects themselves run against the real
 * server in integration/race.integration.test.ts and in bonus-ui.spec.ts.
 */
const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function account(browser: Browser, name: string, locale: "fr-CA" | "en-US") {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [name]);
  if (row === undefined) throw new Error("Missing test account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" });
  contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return context.newPage();
}
const panel = (page: Page) => page.getByRole("region", { name: /^(Réglages de la course|Race settings)$/ });
const mode = (page: Page) => panel(page).locator("div", { has: page.locator("dt", { hasText: /^(Mode de jeu|Game mode)$/ }) }).locator("dd");

test("Arcade reaches another member, survives reload and is frozen in the race; training is the default", async ({ browser }) => {
  const host = await account(browser, "ArcadeHost", "fr-CA");
  const member = await account(browser, "ArcadeMember", "en-US");
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: "Ouvrir la salle", exact: true }).click();
  await expect(host.getByText("[.En direct]", { exact: true })).toBeVisible();
  const code = host.url().split("/").at(-1) ?? "";
  await member.goto(`/rooms/${code}`);
  await member.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(member.getByText("[.Live]", { exact: true })).toBeVisible();
  await expect(mode(host)).toHaveText("Entraînement");
  await expect(mode(member)).toHaveText("Training");

  await panel(host).getByRole("button", { name: "Modifier les réglages" }).click();
  const select = panel(host).getByRole("combobox", { name: "Mode de jeu" });
  await select.focus();
  await select.selectOption("arcade");
  await expect(panel(host).getByText(/Arcade : les coureurs en retard reçoivent des bonus/)).toBeVisible();
  await expectNoAccessibilityViolation(host);
  await panel(host).getByRole("button", { name: "Enregistrer les réglages" }).click();
  await expect(panel(host).getByRole("status")).toHaveText("Réglages enregistrés.");
  await expect(mode(member)).toHaveText("Arcade");
  await member.reload();
  await expect(mode(member)).toHaveText("Arcade");
  const [row] = await query<{ bonuses_enabled: boolean }>("select s.bonuses_enabled from lobby_settings s join lobbies l on l.id = s.lobby_id where l.code = $1", [code]);
  expect(row?.bonuses_enabled).toBe(true);

  await host.getByRole("button", { name: "Lancer la course", exact: true }).click();
  await expect(host.locator(".course-texte")).toBeVisible({ timeout: 10_000 });
  const [race] = await query<{ config: Record<string, unknown> }>("select config_snapshot as config from races r join lobbies l on l.current_race_id = r.id where l.code = $1", [code]);
  expect(race?.config.bonuses).toBe(true);
});
