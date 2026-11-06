import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function fixture(browser: Browser, locale: string, javaScriptEnabled = true) {
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('Journal sailor') returning id, session_version");
  const context = await browser.newContext({ locale, javaScriptEnabled, reducedMotion: "reduce" }); contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account!.id, sessionVersion: account!.session_version, authTime: Math.floor(Date.now() / 1000),
  }) }]);
  const id = randomUUID();
  await query(`insert into races(id,round_no,state,rules_version,text_snapshot,config_snapshot,
    countdown_at,started_at,ended_at,owner_id,lease_expires_at)
    values ($1,1,'finished',1,'sea','{"bonuses":true,"errorMode":"mandatory"}',
    '2026-11-05T10:00:00Z','2026-11-05T10:00:03Z','2026-11-05T10:00:13Z',$1,'2026-11-05T10:01:00Z')`, [id]);
  const journals = [
    { version: 1, grants: [
      { kind: "fogLeader", milestone: 25, activation: { targetOrdinal: 3, atMs: 1234 } },
      { kind: "shortenSelf", milestone: 50 },
    ] },
    { version: 1, grants: [] }, null,
  ];
  for (let index = 0; index < 3; index++) {
    const [entrant] = await query<{ id: string }>(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot,kind,bot_level)
      values($1,$2,$3,$4,$5,$6) returning id`, [id, index === 0 ? account!.id : null, index + 1,
      ["Journal sailor", "Bot 1", "#3"][index], ["human", "bot", "guest"][index], index === 1 ? "intermediate" : null]);
    await query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
      correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy,bonus_journal)
      values($1,$2,'finished',$3,10000,3,3,3,3,3.6,3.6,100,$4)`, [id, entrant!.id, index + 1, journals[index]]);
  }
  return { context, page: await context.newPage(), id };
}

for (const locale of ["fr", "en"]) test(`bonus journal: ${locale}, two themes, keyboard and small widths`, async ({ browser }) => {
  const owner = await fixture(browser, locale);
  for (const theme of ["abysse", "aube"]) {
    await owner.context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
    await owner.page.goto(`/races/${owner.id}`);
    const journal = owner.page.getByRole("region", { name: locale === "fr" ? "Journal des bonus" : "Bonus journal" });
    const first = journal.locator("summary").first();
    await first.focus(); await expect(first).toBeFocused(); await owner.page.keyboard.press("Enter");
    await expect(journal.getByText(locale === "fr" ? "Utilisé → #3 · à 1,234 s" : "Used → #3 · at 1.234 s")).toBeVisible();
    await expect(journal.getByText(locale === "fr" ? "Non utilisé" : "Unused", { exact: true })).toBeVisible();
    await journal.locator("summary").nth(1).click(); await journal.locator("summary").nth(2).click();
    await expect(journal.getByText(locale === "fr" ? "Aucun bonus reçu." : "No bonuses received.")).toBeVisible();
    await expect(journal.getByText(locale === "fr" ? /Journal indisponible/ : /Journal unavailable/)).toBeVisible();
    for (const width of [360, 390, 1024, 1440]) {
      await owner.page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(owner.page);
      if (width === 360) await expectNoAccessibilityViolation(owner.page);
      await owner.page.screenshot({ path: test.info().outputPath(`journal-${locale}-${theme}-${width}.png`), fullPage: true });
    }
    const before = await journal.textContent();
    await owner.page.reload(); expect(await journal.textContent()).toBe(before);
  }
});

test("journal is server-rendered without JavaScript and refuses unrelated history readers", async ({ browser, page }) => {
  const owner = await fixture(browser, "en", false);
  await owner.page.goto(`/races/${owner.id}`);
  const journal = owner.page.getByRole("region", { name: "Bonus journal" });
  await journal.locator("summary").first().click();
  await expect(journal.getByText("Used → #3 · at 1.234 s")).toBeVisible();
  await page.goto(`/races/${owner.id}`); await expect(page).toHaveURL(/\/sign-in/);
  const outsider = await fixture(browser, "en");
  await outsider.page.goto(`/races/${owner.id}`);
  await expect(outsider.page.getByRole("region", { name: "Bonus journal" })).toHaveCount(0);
});
