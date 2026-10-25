import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];

test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

/** A new account of its own with a session cookie (the demo accounts' limits are shared by every spec). */
async function signedIn(browser: Browser, displayName: string, options: { locale: "fr-CA" | "en-US"; width?: number; theme?: "abysse" | "aube" }): Promise<{ page: Page; context: BrowserContext }> {
  const [created] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [displayName]);
  if (created === undefined) {
    throw new Error("The account was not created");
  }
  const baseURL = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext({ locale: options.locale, ...(options.width === undefined ? {} : { viewport: { width: options.width, height: 800 } }) });
  contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: created.id, sessionVersion: created.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL }]);
  if (options.theme !== undefined) {
    await context.addCookies([{ name: "theme", value: options.theme, url: baseURL }]);
  }
  return { page: await context.newPage(), context };
}

/** Opens a room as `host`, whose pages are in English or in French. */
async function openRoom(host: Page): Promise<string> {
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: /^(Open the room|Ouvrir la salle)$/ }).click();
  await expect(host).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  await expect(host.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
  return host.url().split("/").at(-1) ?? "";
}

/** Joins the room `code` as `guest`, whose pages are in French or in English. */
async function join(guest: Page, code: string): Promise<void> {
  await guest.goto(`/rooms/${code}`);
  await guest.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
  await expect(guest.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
}

/** The text as the page shows it, grapheme by grapheme. */
async function raceText(page: Page): Promise<string> {
  const text = page.locator(".course-texte");
  await expect(text).toBeVisible();
  return (await text.textContent()) ?? "";
}

/** Where an element sits in the page (not the viewport): a question that scrolls into view moves nothing. */
async function pageTop(locator: ReturnType<Page["locator"]>): Promise<number> {
  return locator.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
}

/** Types like a person, below the engine's plausibility limit (25 graphemes a second). */
async function typeText(field: ReturnType<Page["getByLabel"]>, text: string): Promise<void> {
  await field.pressSequentially(text, { delay: 70 });
}

test("locale formats stay consistent through a race, server results and hydration", async ({ browser }) => {
  test.setTimeout(90_000);
  const { page: host } = await signedIn(browser, "Locale EN", { locale: "en-US" });
  const { page: guest } = await signedIn(browser, "Locale FR", { locale: "fr-CA" });
  const errors: string[] = [];
  host.on("pageerror", error => errors.push(error.message));
  guest.on("pageerror", error => errors.push(error.message));
  const code = await openRoom(host);
  await join(guest, code);
  await expect(host.getByText("2 / 30 participants", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "Start the race" }).click();
  await expect(host.getByRole("timer")).toBeVisible();
  await expect(guest.getByRole("timer")).toBeVisible();
  const text = await raceText(host);
  await expect(host.getByLabel("Your typing")).toBeEnabled({ timeout: 6000 });
  await Promise.all([typeText(host.getByLabel("Your typing"), text), typeText(guest.getByLabel("Ta frappe"), text)]);
  await expect(host.getByRole("heading", { name: /End of the crossing/i })).toBeVisible({ timeout: 15000 });
  await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible();
  await guest.getByRole("link", { name: "Voir la fiche de la course" }).click();
  const raceUrl = guest.url();
  const raceId = raceUrl.split("/").at(-1);
  // A large round number distinguishes locale grouping, unlike normal early rounds.
  await query("update races set round_no = 1234 where id = $1", [raceId]);
  for (const [page, locale, round] of [[host, "en", "1,234"], [guest, "fr", "1\u202f234"]] as const) {
    await page.goto(raceUrl);
    await expect(page).toHaveTitle(new RegExp(round));
    await expect(page.locator("main")).toContainText(round);
    const response = await page.request.get(raceUrl);
    expect(await response.text()).toContain(round);
    const data = await page.getByRole("table").innerText();
    expect(data).toMatch(locale === "fr" ? /100\s%/u : /100%/u);
    expect(data).toMatch(locale === "fr" ? /0:\d{2},\d/ : /0:\d{2}\.\d/);
    for (const theme of ["abysse", "aube"] as const) {
      await page.context().addCookies([{ name: "theme", value: theme, url: raceUrl }]);
      await page.reload();
      for (const width of [1440, 1024, 390, 360]) {
        await page.setViewportSize({ width, height: 900 });
        await expectNoHorizontalScroll(page);
        if (width === 360) await expectNoAccessibilityViolation(page);
        if (width !== 360) await page.screenshot({ path: `../../docs/evidence/f07-6/${locale}-${theme}-${width}.png`, fullPage: true });
      }
    }
  }
  expect(errors).toEqual([]);
});
