import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function member(browser: Browser, name: string, locale: "fr-CA" | "en-US" = "en-US", theme = "abysse"): Promise<Page> {
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [name]);
  if (!account) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  contexts.push(context);
  const url = test.info().project.use.baseURL ?? "";
  const cookie = await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url }, { name: "theme", value: theme, url }]);
  return context.newPage();
}
async function create(host: Page): Promise<string> {
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: /^(Open the room|Ouvrir la salle)$/ }).click();
  await expect(host.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
  return host.url().split("/").at(-1) ?? "";
}
async function join(page: Page, code: string): Promise<void> {
  await page.goto(`/rooms/${code}`);
  await page.getByRole("button", { name: /^(Join the room|Rejoindre la salle)$/ }).click();
  await expect(page.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
}
async function leave(host: Page): Promise<void> {
  await host.getByRole("button", { name: "Leave the room", exact: true }).click();
  await host.getByRole("button", { name: "Yes, leave the room", exact: true }).click();
  await expect(host).toHaveURL(/\/$/);
}

for (const phase of ["countdown", "racing"] as const) {
  test(`host departure during ${phase} preserves the race, records only their abandon and grants next-round control`, async ({ browser }) => {
    const host = await member(browser, "Captain");
    const successor = await member(browser, "Successor", "fr-CA", "aube");
    const code = await create(host);
    await join(successor, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const field = successor.getByLabel("Ta frappe");
    if (phase === "countdown") await expect(host.getByRole("timer")).toBeVisible();
    else await expect(field).toBeEnabled({ timeout: 6_000 });
    const [race] = await query<{ id: string }>("select current_race_id as id from lobbies where code = $1", [code]);
    if (!race) throw new Error("Missing started race");
    await leave(host);
    await expect(field).toBeEnabled({ timeout: 6_000 });
    const text = (await successor.locator(".course-texte").textContent()) ?? "";
    await field.pressSequentially(text, { delay: 70 });
    await expect(successor.getByRole("table", { name: "Classement de la manche" })).toBeVisible();
    await expect(successor.getByRole("row", { name: /Captain/ })).toContainText("abandon");
    await expect(successor.getByRole("button", { name: "Prochaine manche" })).toBeVisible();
    const results = await query<{ status: string; reason: string | null }>("select outcome as status, abandonment_reason as reason from race_results where race_id = $1 order by outcome", [race.id]);
    expect(results).toHaveLength(2);
    expect(results).toContainEqual({ status: "abandoned", reason: "voluntary" });
    expect(results).toContainEqual({ status: "finished", reason: null });
    await successor.reload();
    await expect(successor.getByRole("button", { name: "Prochaine manche" })).toBeEnabled();
    await successor.getByRole("button", { name: "Prochaine manche" }).click();
    await expect(successor.getByRole("button", { name: "Lancer la course" })).toBeVisible();
    await expect(successor.getByRole("button", { name: "Modifier les réglages" })).toBeVisible();
  });
}

test("host departure on results preserves the saved race and transfers next-round controls live", async ({ browser }) => {
  const host = await member(browser, "Captain");
  const successor = await member(browser, "Successor", "fr-CA");
  const code = await create(host);
  await join(successor, code);
  await host.getByRole("button", { name: "Start the race" }).click();
  await expect(host.getByLabel("Your typing")).toBeEnabled({ timeout: 6_000 });
  const text = (await host.locator(".course-texte").textContent()) ?? "";
  await Promise.all([
    host.getByLabel("Your typing").pressSequentially(text, { delay: 70 }),
    successor.getByLabel("Ta frappe").pressSequentially(text, { delay: 70 }),
  ]);
  await expect(successor.getByRole("table", { name: "Classement de la manche" })).toBeVisible();
  await expect(successor.getByRole("button", { name: "Prochaine manche" })).toHaveCount(0);
  const [race] = await query<{ id: string }>("select current_race_id as id from lobbies where code = $1", [code]);
  if (!race) throw new Error("Missing finished race");
  const saved = await query("select * from race_results where race_id = $1 order by entrant_id", [race.id]);
  expect(saved).toHaveLength(2);
  await leave(host);
  await expect(successor.getByRole("button", { name: "Prochaine manche" })).toBeEnabled();
  expect(await query("select * from race_results where race_id = $1 order by entrant_id", [race.id])).toEqual(saved);
  await successor.getByRole("button", { name: "Prochaine manche" }).click();
  await expect(successor.getByRole("button", { name: "Lancer la course" })).toBeVisible();
});

for (const locale of ["fr-CA", "en-US"] as const) {
  for (const theme of ["abysse", "aube"] as const) {
    test(`host departure confirmation is readable and keyboard accessible: ${locale} ${theme}`, async ({ browser }, testInfo) => {
      const host = await member(browser, "Captain", locale, theme);
      await create(host);
      const opener = host.getByRole("button", { name: /^(Quitter la salle|Leave the room)$/ });
      await opener.click();
      const question = host.getByRole("heading", { name: /^(Quitter la salle|Leave room)/ });
      await expect(question).toBeFocused();
      for (const width of [1440, 1024, 390]) {
        await host.setViewportSize({ width, height: 900 });
        await expectNoHorizontalScroll(host);
        await expectNoAccessibilityViolation(host);
        await host.screenshot({ path: testInfo.outputPath(`host-leave-${locale}-${theme}-${width}.png`), fullPage: true });
      }
      await host.keyboard.press("Escape");
      await expect(opener).toBeFocused();
      await expect(question).toHaveCount(0);
    });
  }
}
