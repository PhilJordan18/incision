import { randomUUID } from "node:crypto";
import { asDuration, computeMeasures } from "@incision/domain";
import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function fixture(browser: Browser, locale: string, javaScriptEnabled = true) {
  const accounts = await query<{ id: string; session_version: number }>(
    "insert into accounts(display_name) values ('Chart Alice'), ('Chart Bob') returning id, session_version");
  const account = accounts[0]!;
  const context = await browser.newContext({ locale, javaScriptEnabled, reducedMotion: "reduce" });
  contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000),
  }) }]);
  const id = randomUUID();
  await query(`insert into races(id,round_no,state,rules_version,text_snapshot,config_snapshot,
    countdown_at,started_at,ended_at,owner_id,lease_expires_at)
    values ($1,1,'finished',1,'sea','{"bonuses":false,"errorMode":"mandatory"}',
    '2026-10-28T09:59:57Z','2026-10-28T10:00:00Z','2026-10-28T10:00:02Z',$1,'2026-10-28T10:01:00Z')`, [id]);
  for (let n = 0; n < 3; n++) {
    const [entrant] = await query<{ id: string }>(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot,kind,bot_level)
      values ($1,$2,$3,$4,$5,$6) returning id`, [id, accounts[n]?.id ?? null, n + 1, ["Chart Alice", "Chart Bob", "Chart Captain"][n], n === 2 ? "bot" : "human", n === 2 ? "intermediate" : null]);
    const elapsed = 2000;
    const counters = { correctInserts: 3, totalInserts: 5 + n };
    const measures = computeMeasures(counters, asDuration(elapsed));
    await query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
      correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy)
      values ($1,$2,'finished',$3,$4,3,3,3,$5,$6,$7,$8)`, [id, entrant!.id, n + 1, elapsed, counters.totalInserts, measures.netWpm, measures.rawWpm, measures.accuracy]);
    const points = [
      { elapsed: 0, counters: { correctInserts: 0, totalInserts: 0 }, measures: computeMeasures({ correctInserts: 0, totalInserts: 0 }, asDuration(0)) },
      { elapsed, counters, measures },
    ];
    await query("insert into race_wpm_series(race_id,entrant_id,series) values($1,$2,$3)", [id, entrant!.id, { version: 1, spacingMs: 1000, points }]);
    await query("insert into race_key_errors(race_id,entrant_id,aggregate) values($1,$2,$3)", [id, entrant!.id, { version: 1, keys: [{ grapheme: n === 0 ? "é" : "Ж", count: 2 + n }] }]);
  }
  return { context, page: await context.newPage(), id };
}

test("real stored charts and only the reader's heatmap render without JavaScript", async ({ browser, page: visitor }) => {
  const owner = await fixture(browser, "en", false);
  await owner.page.goto(`/races/${owner.id}`);
  const speed = owner.page.getByRole("region", { name: "Speed during the race", exact: true });
  await expect(speed.locator("svg").first().locator("polyline")).toHaveCount(3);
  await expect(speed).toContainText("Bot · Captain — intermediate");
  await speed.locator("summary").click();
  await expect(speed.getByRole("table")).toHaveCount(3);
  await expect(speed.getByRole("table").first()).toContainText("30");
  const heatmap = owner.page.getByRole("region", { name: "Your missed characters", exact: true });
  await expect(heatmap).toContainText("Total errors : 2");
  await expect(heatmap).not.toContainText("Ж");
  await expect(heatmap.getByLabel("é — 2 errors", { exact: true })).toBeVisible();
  await owner.page.reload();
  await expect(heatmap).toContainText("Total errors : 2");
  await visitor.goto(`/races/${owner.id}`);
  await expect(visitor).toHaveURL(/\/sign-in/);
});

for (const locale of ["fr", "en"]) test(`charts, accessible tables and keyboard heatmap in ${locale}`, async ({ browser }) => {
  const owner = await fixture(browser, locale);
  for (const theme of ["abysse", "aube"]) {
    await owner.context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
    await owner.page.goto(`/races/${owner.id}`);
    await expect(owner.page.locator("html")).toHaveAttribute("data-theme", theme);
    const speed = owner.page.getByRole("region", { name: locale === "fr" ? "Vitesse pendant la course" : "Speed during the race", exact: true });
    const heatmap = owner.page.getByRole("region", { name: locale === "fr" ? "Tes caractères manqués" : "Your missed characters", exact: true });
    await speed.locator("summary").click();
    await heatmap.locator("summary").click();
    for (const width of [1440, 1024, 390, 320]) {
      await owner.page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(owner.page);
      if (width === 320) {
        await expectNoAccessibilityViolation(owner.page);
        const graph = speed.getByRole("region", { name: locale === "fr" ? "Courbes des MPM nets de tous les participants" : "Net WPM curves for all participants", exact: true }).first();
        await graph.focus();
        await owner.page.keyboard.press("ArrowRight");
        await expect.poll(() => graph.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
        expect(await graph.evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
        const keyboard = heatmap.getByRole("region", { name: locale === "fr" ? "Repère AZERTY" : "AZERTY reference", exact: true });
        await keyboard.focus(); await expect(keyboard).toBeFocused();
        await owner.page.keyboard.press("Tab");
        await expect(keyboard.locator('[tabindex="0"]').first()).toBeFocused();
        expect(await keyboard.locator('[tabindex="0"]').first().evaluate((node) => getComputedStyle(node).outlineStyle)).not.toBe("none");
        const tableRegion = speed.getByRole("region", { name: /— Chart Alice$/ });
        await tableRegion.focus();
        await owner.page.keyboard.press("ArrowRight");
        await expect.poll(() => tableRegion.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
      }
      if (process.env.CHART_SCREENSHOTS) {
        await speed.screenshot({ path: `${process.env.CHART_SCREENSHOTS}/speed-${locale}-${theme}-${width}.png` });
        await heatmap.screenshot({ path: `${process.env.CHART_SCREENSHOTS}/heatmap-${locale}-${theme}-${width}.png` });
      }
    }
  }
});
