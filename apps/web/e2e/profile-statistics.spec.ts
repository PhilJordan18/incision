import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });
async function member(browser: Browser, locale = "en", javaScriptEnabled = true) {
  const [account] = await query<{ id: string; session_version: number }>(
    "insert into accounts(display_name) values ('Statistics sailor') returning id, session_version");
  if (!account) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, javaScriptEnabled, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000),
  }) }]);
  return { context, page: await context.newPage(), accountId: account.id };
}

async function seed(accountId: string) {
  const [other] = await query<{ id: string }>("insert into accounts(display_name) values ('Synthetic opponent') returning id");
  for (let n = 0; n < 4; n++) {
    const id = randomUUID();
    await query(`insert into races(id,round_no,state,rules_version,text_snapshot,config_snapshot,
      countdown_at,started_at,ended_at,owner_id,lease_expires_at,interruption_reason)
      values ($1,1,$2,1,'sea','{}','2026-10-25T09:59:57Z','2026-10-25T10:00:00Z',
      '2026-10-25T10:00:01Z'::timestamptz + $3::integer * interval '1 second',$1,'2026-10-25T10:01:00Z',$4)`,
    [id, n === 3 ? "interrupted" : "finished", n, n === 3 ? "server_stopped" : null]);
    const [entrant] = await query<{ id: string }>(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot)
      values ($1,$2,1,'Statistics sailor') returning id`, [id, accountId]);
    await query(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot) values ($1,$2,2,'Opponent')`, [id, other!.id]);
    const outcome = n === 1 ? "timed_out" : n === 2 ? "abandoned" : "finished";
    const speed = [60, 30, 0, 999][n]!;
    const accuracy = [90, 60, 0, 100][n]!;
    await query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
      correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy,abandonment_reason)
      values ($1,$2,$3,1,1000,$4,3,2,2,$5,$5,$6,$7)`,
    [id, entrant!.id, outcome, outcome === "finished" ? 3 : 2, speed, accuracy, outcome === "abandoned" ? "voluntary" : null]);
  }
}

test("private statistics use completed races and remain readable without JavaScript", async ({ browser, page: visitor }) => {
  await visitor.goto("/account"); await expect(visitor).toHaveURL(/\/sign-in/);
  const owner = await member(browser, "en", false); await seed(owner.accountId);
  const response = await owner.page.goto("/account");
  expect(response?.headers()["cache-control"]).toContain("private");
  expect(response?.headers()["cache-control"]).toContain("no-store");
  for (const [key, value] of Object.entries({ best: "60", average: "30", accuracy: "50%", races: "3", victories: "1" })) {
    await expect(owner.page.locator(`[data-stat="${key}"]`)).toHaveText(value);
  }
  const toggle = owner.page.locator("summary").filter({ hasText: "View chart values" });
  await toggle.focus(); await owner.page.keyboard.press("Enter");
  await expect(owner.page.getByRole("table").getByRole("row")).toHaveCount(4);
  await expect(owner.page.getByRole("table")).not.toContainText("999");
  await owner.page.reload(); await expect(owner.page.locator('[data-stat="races"]')).toHaveText("3");
  const stranger = await member(browser);
  await stranger.page.goto(`/account?accountId=${owner.accountId}`);
  await expect(stranger.page.locator('[data-stat="races"]')).toHaveText("0");
  await expect(stranger.page.locator('[data-stat="best"]')).toHaveText("—");
  await expect(stranger.page.getByText("No completed races yet.", { exact: false })).toBeVisible();
});

for (const locale of ["fr", "en"]) test(`profile statistics respect language, themes and widths in ${locale}`, async ({ browser }) => {
  const owner = await member(browser, locale); await seed(owner.accountId);
  for (const theme of ["abysse", "aube"]) {
    await owner.context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
    await owner.page.goto("/account");
    await expect(owner.page.getByRole("heading", { name: locale === "fr" ? "Tes statistiques" : "Your statistics", exact: true })).toBeVisible();
    await expect(owner.page.locator("main .bg-action")).toHaveCount(1);
    await owner.page.locator("summary").click();
    for (const width of [1440, 1024, 390, 360]) {
      await owner.page.setViewportSize({ width, height: 1100 }); await expectNoHorizontalScroll(owner.page);
      if (width === 360) await expectNoAccessibilityViolation(owner.page);
      else if (process.env.PROFILE_STATS_SCREENSHOTS) await owner.page.screenshot({ path: `${process.env.PROFILE_STATS_SCREENSHOTS}/stats-${locale}-${theme}-${width}.png`, fullPage: true });
    }
  }
});
