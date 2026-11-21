import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function visitor(browser: Browser) {
  const context = await browser.newContext({ locale: "fr-CA", reducedMotion: "reduce" }); contexts.push(context);
  return { context, page: await context.newPage() };
}

/**
 * BONUS-02 in two real browsers, real server and database: an account hosts an Arcade room, a
 * guest enters through the public guest form, the account leads past 25 %, and the guest uses its
 * bonus by pressing Enter in its typing field.
 */
test("a guest uses its bonus with Enter in a real race against an account", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await visitor(browser);
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Hôte') returning id,session_version");
  await host.context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account!.id, sessionVersion: account!.session_version, authTime: Math.floor(Date.now() / 1000) }) }]);
  await host.page.goto("/rooms/new"); await host.page.getByRole("button", { name: "Ouvrir la salle" }).click();
  await expect(host.page.getByText("[.En direct]", { exact: true })).toBeVisible();
  const code = host.page.url().split("/").at(-1)!;
  // Arcade (CONF-09) and a short text, as the host's settings form saves them (arcade-settings.spec.ts covers the form).
  await query("update lobby_settings set bonuses_enabled=true, word_count=10, time_limit_ms=null where lobby_id=(select id from lobbies where code=$1)", [code]);

  const guest = await visitor(browser);
  await guest.page.goto(`/guest?code=${code}`);
  await guest.page.getByLabel("Pseudo pour cette salle").fill("Visiteur");
  await guest.page.getByRole("button", { name: "Entrer dans la salle" }).click();
  await expect(guest.page.getByText("[.En direct]", { exact: true })).toBeVisible();
  await host.page.reload(); await expect(host.page.getByText("[.En direct]", { exact: true })).toBeVisible();

  await host.page.getByRole("button", { name: "Lancer la course" }).click();
  const hostField = host.page.getByLabel("Ta frappe"); const guestField = guest.page.getByLabel("Ta frappe");
  await expect(hostField).toBeEnabled({ timeout: 15_000 }); await expect(guestField).toBeEnabled();
  const text = (await host.page.locator(".course-texte").textContent()) ?? "";
  const graphemes = [...text];
  await hostField.pressSequentially(graphemes.slice(0, Math.ceil(graphemes.length * 0.3)).join(""), { delay: 60 });

  // 1. The account leads: the guest receives a bonus.
  const inventory = guest.page.getByRole("list", { name: "Tes bonus · ordre d’utilisation" });
  await expect(inventory.getByRole("listitem")).toHaveCount(1, { timeout: 10_000 });
  // 2. The guest types, then really presses Enter.
  await guestField.pressSequentially(graphemes.slice(0, 2).join(""), { delay: 80 });
  const typedBefore = await guest.page.locator(".course-texte").innerHTML();
  const valueBefore = await guestField.inputValue();
  await guest.page.screenshot({ path: test.info().outputPath("1-guest-before-enter.png"), fullPage: true });
  await guestField.press("Enter");
  let rateLimited = false;
  const announcement = /Visiteur active (Raccourci|Rallonge|Brouillard) → /;
  // 5. A rate-limited activation keeps the bonus and says so; Enter again retries.
  if (await guest.page.getByText("Trop de demandes. Patiente, puis réessaie avec Entrée.").isVisible()) {
    rateLimited = true;
    await expect(inventory.getByRole("listitem")).toHaveCount(1);
    await guestField.press("Enter");
  }
  // 3. The effect applies, the announcement appears for both, the bonus is consumed once.
  await expect(guest.page.getByText("Aucun bonus en réserve.")).toBeVisible({ timeout: 10_000 });
  await expect(host.page.getByText(announcement)).toHaveCount(1);
  await expect(guest.page.getByText(announcement)).toHaveCount(1);
  await guestField.press("Enter"); // Nothing left: no second activation.
  await guest.page.waitForTimeout(500);
  await expect(host.page.getByText(announcement)).toHaveCount(1);
  // 4. Enter typed no character.
  expect(await guestField.inputValue()).toBe(valueBefore);
  const [race] = await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [code]);
  await host.page.screenshot({ path: test.info().outputPath("2-host-announcement.png"), fullPage: true });
  await guest.page.screenshot({ path: test.info().outputPath("3-guest-after-enter.png"), fullPage: true });
  test.info().annotations.push({ type: "rate-limited on first Enter", description: String(rateLimited) },
    { type: "typed text changed by the effect", description: String(typedBefore !== await guest.page.locator(".course-texte").innerHTML()) });

  // 6. The final journal: both abandon, the race is saved with the guest's used bonus.
  for (const page of [guest.page, host.page]) {
    await page.getByRole("button", { name: "Abandonner la course", exact: true }).click();
    await page.getByRole("button", { name: "Oui, abandonner", exact: true }).click();
  }
  await expect(guest.page.locator("#results-heading")).toBeVisible({ timeout: 20_000 });
  const journals = await query<{ kind: string; bonus_journal: { grants: { milestone: number; activation?: { atMs: number } }[] } | null }>(
    "select e.kind, r.bonus_journal from race_results r join race_entrants e on e.id=r.entrant_id where r.race_id=$1 order by e.kind", [race!.id]);
  const guestJournal = journals.find((row) => row.kind === "guest")?.bonus_journal;
  expect(guestJournal?.grants).toHaveLength(1);
  expect(guestJournal?.grants[0]).toMatchObject({ milestone: 25, activation: { atMs: expect.any(Number) } });
  await guest.page.screenshot({ path: test.info().outputPath("4-guest-results.png"), fullPage: true });
});
