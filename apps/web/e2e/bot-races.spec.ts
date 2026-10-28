import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id = null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });
async function host(browser: Browser, locale: string) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('BotRaceHost') returning id, session_version");
  if (!row) throw new Error("fixture account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version,
    authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
  const page = await context.newPage(); await page.goto("/rooms/new");
  await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  return { page, accountId: row.id, code: page.url().split("/").at(-1)! };
}

for (const [mode, locale] of [["mandatory", "fr-CA"], ["free", "en-US"]] as const) {
  test(`a real server bot finishes in ${mode}, persists results and starts a fresh next round`, async ({ browser }) => {
    test.setTimeout(90_000);
    const { page, accountId, code } = await host(browser, locale);
    if (mode === "free") {
      const settings = page.getByRole("region", { name: "Race settings" });
      await settings.getByRole("button", { name: "Edit settings" }).click();
      await settings.getByRole("combobox", { name: "Typing mode", exact: true }).selectOption("free");
      await settings.getByRole("button", { name: "Save settings" }).click();
      await expect(settings.getByRole("status")).toHaveText("Settings saved.");
    }
    const bots = page.getByRole("region", { name: "Bots", exact: true });
    await bots.getByRole("combobox").selectOption("impossible");
    await bots.getByRole("button", { name: /^(Ajouter un bot|Add a bot)$/ }).click();
    await expect(bots.getByRole("listitem")).toHaveCount(1);
    const start = page.getByRole("button", { name: /^(Lancer la course|Start the race)$/ });
    await expect(start).toBeEnabled(); await start.click();
    await expect(page.getByLabel(/^(Ta frappe|Your typing)$/)).toBeEnabled({ timeout: 10_000 });
    const point = page.locator('[data-runner][data-kind="bot"]');
    await expect(point).toHaveCount(1);
    await expect(point).not.toHaveAttribute("data-position", "0", { timeout: 10_000 });
    await page.getByRole("button", { name: /^(Abandonner la course|Give up the race)$/ }).click();
    await page.getByRole("button", { name: /^(Oui, abandonner|Yes, give up)$/ }).click();
    // The host sends no bot keystrokes; the real server engine reaches the finish on its own.
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fin de la|End of the/i, { timeout: 20_000 });
    const [race] = await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [code]);
    if (!race) throw new Error("missing race");
    const rows = await query<{ kind: string; bot_level: string | null; account_id: string | null; outcome: string; total_inputs: string; correct_inputs: string; position: number; length: number; series: unknown; aggregate: unknown }>(
      `select e.kind,e.bot_level,e.account_id,r.outcome,r.total_inputs,r.correct_inputs,r.position,r.length,s.series,k.aggregate
       from race_entrants e join race_results r on r.entrant_id=e.id left join race_wpm_series s on s.entrant_id=e.id
       left join race_key_errors k on k.entrant_id=e.id where e.race_id=$1 order by e.ordinal`, [race.id]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ kind: "human", account_id: accountId, outcome: "abandoned" });
    const bot = rows[1]!;
    expect(bot).toMatchObject({ kind: "bot", bot_level: "impossible", account_id: null, outcome: "finished" });
    expect(bot.position).toBe(bot.length); expect(Number(bot.total_inputs)).toBeGreaterThanOrEqual(bot.length);
    if (mode === "mandatory") expect(Number(bot.correct_inputs)).toBe(bot.length);
    expect(bot.series).toMatchObject({ version: 1 }); expect(bot.aggregate).toMatchObject({ version: 1 });
    await expect(page.getByRole("table").getByText(/Bot ·/)).toBeVisible();
    await page.reload(); await expect(page.getByRole("table").getByText(/Bot ·/)).toBeVisible();
    for (const theme of ["abysse", "aube"]) {
      await page.evaluate((value) => document.documentElement.dataset.theme = value, theme);
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
        await page.screenshot({ path: `../../docs/evidence/f05-2b-bot-races/${locale}-${theme}-${width}.png`, fullPage: true });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/races/${race.id}`); await expect(page.getByRole("table").getByText(/Bot ·/)).toBeVisible();
    await page.goto(`/rooms/${code}`);
    await page.getByRole("button", { name: /^(Prochaine manche|Next round)$/ }).click();
    await expect(bots.getByRole("listitem")).toContainText(/impossible/);
    await expect(start).toBeEnabled(); await start.click();
    await expect(page.getByLabel(/^(Ta frappe|Your typing)$/)).toBeEnabled({ timeout: 10_000 });
    const [next] = await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [code]);
    expect(next?.id).not.toBe(race.id);
    await expect(point).not.toHaveAttribute("data-position", "0", { timeout: 10_000 });
    // Confirmed host departure closes the only-human room and interrupts this second race.
    await page.getByRole("button", { name: /^(Quitter la salle|Leave the room)$/ }).click();
    await page.getByRole("button", { name: /^(Oui, quitter la salle|Yes, leave the room)$/ }).click();
    await expect.poll(async () => (await query<{ state: string }>("select state from races where id=$1", [next!.id]))[0]?.state).toBe("interrupted");
    expect((await query("select * from race_results where race_id=$1", [next!.id]))).toHaveLength(0);
  });
}
