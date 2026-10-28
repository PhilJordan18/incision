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
  await panel(page).getByRole("combobox", { name: /Text language|Langue du texte/ }).selectOption(language);
  await panel(page).getByRole("checkbox", { name: /^(Aucune limite|No limit)$/ }).setChecked(seconds === "none");
  if (seconds !== "none") await panel(page).getByRole("spinbutton").fill(seconds);
}
async function save(page: Page) {
  await panel(page).getByRole("button", { name: /^(Enregistrer les réglages|Save settings)$/ }).click();
  await expect(panel(page).getByRole("status")).toHaveText(/^(Réglages enregistrés\.|Settings saved\.)$/);
}

for (const duration of ["60", "600", "none"]) {
test(`saved language and duration ${duration} reach another member, survive reload and govern the real start`, async ({ browser }) => {
  const { page: host } = await account(browser, "SettingsHost");
  const { page: member } = await account(browser, "SettingsMember");
  const code = await open(host);
  await member.goto(`/rooms/${code}`);
  await member.getByRole("button", { name: "Rejoindre la salle", exact: true }).click();
  await expect(member.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(panel(member).getByRole("button", { name: "Modifier les réglages" })).toHaveCount(0);
  await edit(host, "en", duration);
  await expect(panel(host).locator("dd").first()).toHaveText("Français"); // no optimistic summary
  await save(host);
  await expect(panel(member).locator("dd").first()).toHaveText("Anglais");
  await expect(panel(member).locator("dd").nth(1)).toHaveText(duration === "none" ? "Aucune limite" : duration);
  await host.reload();
  await expect(host.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(panel(host).locator("dd").nth(1)).toHaveText(duration === "none" ? "Aucune limite" : duration);
  await expect(host.locator("#start-note")).toContainText(duration === "none" ? "Aucune limite" : `${duration} s`);
  await host.getByRole("button", { name: "Lancer la course", exact: true }).click();
  await expect(host.locator(".course-texte")).toBeVisible({ timeout: 10_000 });
  await expect(panel(host)).toHaveCount(0);
  const [race] = await query<{ text: string; config: Record<string, unknown> }>(
    "select text_snapshot as text, config_snapshot as config from races r join lobbies l on l.current_race_id = r.id where l.code = $1", [code]);
  expect(race?.config).toMatchObject({ language: "en", timeLimitMs: duration === "none" ? null : Number(duration) * 1000, errorMode: "mandatory" });
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
  await expect(panel(host).locator("dd").nth(1)).toHaveText(duration === "none" ? "Aucune limite" : duration);
  await expect(panel(member).locator("dd").nth(1)).toHaveText(duration === "none" ? "Aucune limite" : duration);
});

}

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
  await panel(first).getByRole("combobox", { name: /Text language|Langue du texte/ }).press("Escape");
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

for (const locale of ["fr-CA", "en-US"]) {
  test(`free typing survives reload, finishes with an error and switches back to mandatory for ${locale}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const { page: host } = await account(browser, `FreeHost${locale}`, locale);
    const { page: member } = await account(browser, `FreeMember${locale}`, locale);
    const code = await open(host);
    await member.goto(`/rooms/${code}`);
    await member.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
    await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
    await edit(host, "en", "none");
    const mode = panel(host).getByRole("combobox", { name: /^(Mode de frappe|Typing mode)$/ });
    await mode.selectOption("free");
    await mode.focus();
    await expect(mode).toBeFocused();
    await save(host);
    await expect(panel(member).locator("dd").nth(2)).toHaveText(/^(Frappe libre|Free typing)$/);
    await host.reload();
    await expect(panel(host).locator("dd").nth(2)).toHaveText(/^(Frappe libre|Free typing)$/);
    await host.getByRole("button", { name: /^(Lancer la course|Start the race)$/ }).click();
    const field = host.getByLabel(/^(Ta frappe|Your typing)$/);
    await expect(field).toBeEnabled({ timeout: 10_000 });
    const text = (await host.locator(".course-texte").textContent())!;
    const wrong = text[0] === "x" ? "y" : "x";
    await field.pressSequentially(wrong + text.slice(1, 3), { delay: 70 });
    await expect(host.locator(".course-erreur")).toHaveCount(1);
    await expect(host.locator(".course-juste")).toHaveCount(2);
    await expect(host.locator(".course-bloque")).toHaveCount(0);
    await expect(member.getByRole("progressbar", { name: `FreeHost${locale}` })).not.toHaveAttribute("value", "0");
    await host.reload();
    await expect(field).toBeEnabled({ timeout: 10_000 });
    await expect(host.locator(".course-erreur")).toHaveCount(1);
    await expect(host.locator(".course-juste")).toHaveCount(2);
    await field.pressSequentially(text.slice(3), { delay: 70 });
    await member.getByRole("button", { name: /^(Abandonner la course|Give up the race)$/ }).click();
    await member.getByRole("button", { name: /^(Oui, abandonner|Yes, give up)$/ }).click();
    await expect(host.getByRole("heading", { level: 1 })).toContainText(/Fin de la|End of the/i);
    const [result] = await query<{ config: Record<string, unknown>; position: number; length: number; correct_inputs: string; total_inputs: string; accuracy: number }>(
      "select r.config_snapshot as config, rr.position, rr.length, rr.correct_inputs, rr.total_inputs, rr.accuracy from races r join lobbies l on l.current_race_id=r.id join race_results rr on rr.race_id=r.id where l.code=$1 and rr.outcome='finished'", [code]);
    expect(result?.config).toMatchObject({ errorMode: "free", timeLimitMs: null });
    expect(result?.position).toBe(text.length);
    expect(result?.length).toBe(text.length);
    expect(Number(result?.total_inputs)).toBe(text.length);
    expect(Number(result?.correct_inputs)).toBe(text.length - 1);
    expect(result?.accuracy).toBeCloseTo((text.length - 1) / text.length * 100, 6);
    await expect(host.getByText(/Première référence|First reference/)).toBeVisible();
    await host.getByRole("button", { name: /^(Prochaine manche|Next round)$/ }).click();
    await edit(host, "en", "none");
    await panel(host).getByRole("combobox", { name: /^(Mode de frappe|Typing mode)$/ }).selectOption("mandatory");
    await save(host);
    await expect(panel(member).locator("dd").nth(2)).toHaveText(/^(Correction obligatoire|Mandatory correction)$/);
    await host.getByRole("button", { name: /^(Lancer la course|Start the race)$/ }).click();
    await expect(field).toBeEnabled({ timeout: 10_000 });
    const nextText = (await host.locator(".course-texte").textContent())!;
    await field.pressSequentially((nextText[0] === "x" ? "y" : "x") + nextText[1], { delay: 70 });
    await expect(host.locator(".course-bloque")).toHaveCount(1);
    await expect(host.locator(".course-juste")).toHaveCount(0);
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await field.press("Backspace");
    await field.pressSequentially(nextText, { delay: 70 });
    await member.getByRole("button", { name: /^(Abandonner la course|Give up the race)$/ }).click();
    await member.getByRole("button", { name: /^(Oui, abandonner|Yes, give up)$/ }).click();
    await expect(host.getByRole("heading", { level: 1 })).toContainText(/Fin de la|End of the/i);
    // The previous free-mode finish must not become the mandatory-mode benchmark.
    await expect(host.getByText(/Première référence|First reference/)).toBeVisible();
  });

  test(`explicit unlimited and duration boundaries persist for ${locale}`, async ({ browser }) => {
    const { page } = await account(browser, `Duration${locale}`, locale);
    const code = await open(page);
    await expect(panel(page).locator("dd").nth(1)).toHaveText(/^(Aucune limite|No limit)$/);
    for (const seconds of ["30", "600", "none"]) {
      await edit(page, "en", seconds);
      const unlimited = panel(page).getByRole("checkbox", { name: /^(Aucune limite|No limit)$/ });
      await unlimited.focus();
      await unlimited.press("Space");
      await expect(unlimited).toBeChecked({ checked: seconds !== "none" });
      await unlimited.press("Space");
      await expect(unlimited).toBeChecked({ checked: seconds === "none" });
      if (seconds !== "none") {
        for (const invalid of ["29", "601"]) {
          await panel(page).getByRole("spinbutton").fill(invalid);
          await expect(panel(page).getByRole("button", { name: /^(Enregistrer les réglages|Save settings)$/ })).toBeDisabled();
        }
        await panel(page).getByRole("spinbutton").fill(seconds);
      } else await expect(panel(page).getByRole("spinbutton")).toBeDisabled();
      await save(page);
      await page.reload();
      await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      const [row] = await query<{ time_limit_ms: number | null }>("select s.time_limit_ms from lobby_settings s join lobbies l on l.id=s.lobby_id where l.code=$1", [code]);
      expect(row?.time_limit_ms).toBe(seconds === "none" ? null : Number(seconds) * 1000);
    }
  });
}
