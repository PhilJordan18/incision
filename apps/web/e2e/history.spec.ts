import { randomUUID } from "node:crypto";
import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function member(browser: Browser, locale = "en-US", javaScriptEnabled = true) {
  const [account] = await query<{ id: string; session_version: number }>(
    "insert into accounts(display_name) values ('History sailor') returning id, session_version",
  );
  if (!account) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, javaScriptEnabled, viewport: { width: 1440, height: 900 } });
  contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000),
  }) }]);
  return { context, page: await context.newPage(), accountId: account.id };
}

async function seed(accountId: string, count: number) {
  const ids: string[] = [];
  for (let round = 1; round <= count; round++) {
    const id = randomUUID();
    ids.push(id);
    await query(`insert into races(id, round_no, state, rules_version, text_snapshot, config_snapshot,
      countdown_at, started_at, ended_at, owner_id, lease_expires_at)
      values ($1, $2, 'finished', 1, 'sea', '{}', '2026-10-25T09:59:57Z', '2026-10-25T10:00:00Z',
      '2026-10-25T10:00:01Z'::timestamptz + $2::integer * interval '1 microsecond', $1, '2026-10-25T10:01:00Z')`, [id, round]);
    const [entrant] = await query<{ id: string }>(`insert into race_entrants(race_id, account_id, ordinal, display_name_snapshot)
      values ($1, $2, 1, 'History sailor') returning id`, [id, accountId]);
    await query(`insert into race_results(race_id, entrant_id, outcome, rank, elapsed_ms, position, length,
      correct_inputs, total_inputs, net_wpm, raw_wpm, accuracy)
      values ($1, $2, 'finished', 1, 1000, 3, 3, 3, 3, 36, 36, 100)`, [id, entrant!.id]);
  }
  return ids;
}

test("private history navigates both ways without JavaScript and reopens persisted results", async ({ browser, page: visitor }) => {
  await visitor.goto("/history");
  await expect(visitor).toHaveURL(/\/sign-in/);
  const owner = await member(browser, "en-US", false);
  const ids = await seed(owner.accountId, 21);
  await owner.page.goto("/account");
  await owner.page.getByRole("link", { name: "Race history", exact: true }).click();
  await expect(owner.page.getByRole("table").getByRole("row")).toHaveCount(21);
  await owner.page.getByRole("link", { name: "Older races", exact: true }).click();
  await expect(owner.page.getByRole("table").getByRole("row")).toHaveCount(2);
  await owner.page.getByRole("link", { name: "Newer races", exact: true }).click();
  await expect(owner.page.getByRole("table").getByRole("row")).toHaveCount(21);
  await owner.page.getByRole("link", { name: "View results", exact: true }).first().click();
  await expect(owner.page).toHaveURL(new RegExp(`/races/${ids.at(-1)}$`));
  await expect(owner.page.getByRole("heading", { level: 1 })).toContainText(/End of the crossing/i);
  const other = await member(browser);
  await other.page.goto(`/history?accountId=${owner.accountId}`);
  await expect(other.page.getByText("No races on this page.", { exact: true })).toBeVisible();
  await other.page.goto(owner.page.url());
  await expect(other.page.getByRole("heading", { level: 1 })).toContainText(/not found/i);
});

for (const locale of ["fr-CA", "en-US"]) {
  test(`history is accessible, responsive and translated in ${locale}`, async ({ browser }) => {
    const owner = await member(browser, locale);
    await seed(owner.accountId, 2);
    for (const theme of ["abysse", "aube"]) {
      await owner.context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
      await owner.page.goto("/history");
      await expect(owner.page.getByRole("columnheader", { name: "Date (UTC)", exact: true })).toBeVisible();
      for (const width of [1440, 1024, 390, 360]) {
        await owner.page.setViewportSize({ width, height: 900 });
        await expectNoHorizontalScroll(owner.page);
        if (width === 360) await expectNoAccessibilityViolation(owner.page);
        else await owner.page.screenshot({ path: test.info().outputPath(`history-${locale}-${theme}-${width}.png`), fullPage: true });
      }
    }
    await owner.page.goto("/history?cursor=a&cursor=b");
    await expect(owner.page.getByRole("main").getByRole("alert")).toHaveText(locale === "fr-CA" ? "Cette page d’historique n’est pas valide." : "This history page is not valid.");
    await expect(owner.page.getByRole("table")).toHaveCount(0);
  });
}
