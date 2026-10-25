import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function fixture(browser: Browser, locale: string, javaScriptEnabled = true) {
  const accounts = await query<{ id: string; session_version: number }>(
    "insert into accounts(display_name) values ('First sailor'), ('Second sailor') returning id, session_version");
  const account = accounts[0]!;
  const context = await browser.newContext({ locale, javaScriptEnabled, reducedMotion: "reduce" });
  contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000),
  }) }]);
  const id = randomUUID();
  await query(`insert into races(id,round_no,state,rules_version,text_snapshot,config_snapshot,
    countdown_at,started_at,ended_at,owner_id,lease_expires_at)
    values ($1,1,'finished',1,'sea','{}','2026-10-25T09:59:57Z','2026-10-25T10:00:00Z',
    '2026-10-25T10:00:02Z',$1,'2026-10-25T10:01:00Z')`, [id]);
  for (let n = 0; n < 2; n++) {
    const [entrant] = await query<{ id: string }>(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot)
      values ($1,$2,$3,$4) returning id`, [id, accounts[n]!.id, n + 1, n === 0 ? "First sailor" : "Second sailor"]);
    await query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
      correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy)
      values ($1,$2,'finished',$3,1000,3,3,3,4,$4,72.5,75)`, [id, entrant!.id, n + 1, n === 0 ? 30 : 60]);
  }
  return { context, page: await context.newPage(), id };
}

test("persisted podium and raw WPM work without JavaScript and survive reload", async ({ browser, page: visitor }) => {
  const owner = await fixture(browser, "en", false);
  await owner.page.goto(`/races/${owner.id}`);
  const podium = owner.page.getByRole("region", { name: "Podium", exact: true });
  await expect(podium.getByRole("listitem")).toHaveCount(2);
  await expect(podium.getByRole("listitem").first()).toContainText("First sailor");
  await expect(podium.getByRole("listitem").nth(1)).toContainText("Second sailor");
  await expect(owner.page.getByRole("table").getByRole("columnheader")).toHaveCount(7);
  await expect(owner.page.getByRole("columnheader", { name: "Raw WPM", exact: true })).toBeVisible();
  await owner.page.reload(); await expect(podium.getByRole("listitem")).toHaveCount(2);
  await visitor.goto(`/races/${owner.id}`); await expect(visitor).toHaveURL(/\/sign-in/);
});

for (const locale of ["fr", "en"]) test(`result podium is accessible and responsive in ${locale}`, async ({ browser }) => {
  const owner = await fixture(browser, locale);
  for (const theme of ["abysse", "aube"]) {
    await owner.context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
    await owner.page.goto(`/races/${owner.id}`);
    await expect(owner.page.getByRole("columnheader", { name: locale === "fr" ? "MPM brut" : "Raw WPM", exact: true })).toBeVisible();
    for (const width of [1440, 1024, 390, 360]) {
      await owner.page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(owner.page);
      if (width === 360) {
        await expectNoAccessibilityViolation(owner.page);
        const scroll = owner.page.getByRole("region").filter({ has: owner.page.getByRole("table") });
        await scroll.focus(); await expect(scroll).toBeFocused();
        await owner.page.keyboard.press("ArrowRight");
      } else if (process.env.RESULTS_SCREENSHOTS) {
        await owner.page.screenshot({ path: `${process.env.RESULTS_SCREENSHOTS}/results-${locale}-${theme}-${width}.png`, fullPage: true });
      }
    }
  }
});
