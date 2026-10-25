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
async function signedIn(browser: Browser, displayName: string, options: { locale: "fr-CA" | "en-US"; width?: number; theme?: "abysse" | "aube"; javaScriptEnabled?: boolean }): Promise<{ page: Page; context: BrowserContext }> {
  const [created] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [displayName]);
  if (created === undefined) {
    throw new Error("The account was not created");
  }
  const baseURL = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext({ locale: options.locale, javaScriptEnabled: options.javaScriptEnabled, ...(options.width === undefined ? {} : { viewport: { width: options.width, height: 800 } }) });
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


test("server-rendered participation stays opt-in before viewport information is available", async ({ browser }) => {
  const { page } = await signedIn(browser, "No script", { locale: "en-US", width: 1440, javaScriptEnabled: false });
  await page.goto("/rooms/new");
  await expect(page.getByRole("checkbox")).not.toBeChecked();
});

test("participation defaults follow 767/768, explicit choices survive resizing and submission", async ({ browser }) => {
  const { page: host } = await signedIn(browser, "Host", { locale: "en-US", width: 767 });
  await host.goto("/rooms/new");
  const choice = host.getByRole("checkbox");
  await expect(choice).not.toBeChecked();
  await host.setViewportSize({ width: 768, height: 800 });
  await expect(choice).toBeChecked();
  await choice.uncheck();
  await host.setViewportSize({ width: 767, height: 800 });
  await host.setViewportSize({ width: 1024, height: 800 });
  await expect(choice).not.toBeChecked();
  await host.getByRole("button", { name: "Open the room" }).click();
  await expect(host.getByText(/^\[\.Live\]$/)).toBeVisible();
  const code = host.url().split("/").at(-1) ?? "";
  const { page: guest } = await signedIn(browser, "Guest", { locale: "en-US", width: 767 });
  await guest.goto(`/rooms/${code}`);
  const guestChoice = guest.getByRole("checkbox");
  await expect(guestChoice).not.toBeChecked();
  await guest.setViewportSize({ width: 768, height: 800 });
  await expect(guestChoice).toBeChecked();
  await guest.setViewportSize({ width: 767, height: 800 });
  await expect(guestChoice).not.toBeChecked();
  await guestChoice.focus();
  await guest.keyboard.press("Space");
  await guest.setViewportSize({ width: 768, height: 800 });
  await guest.setViewportSize({ width: 767, height: 800 });
  await expect(guestChoice).toBeChecked();
  await guest.getByRole("button", { name: "Join the room" }).click();
  await expect(guest.getByText(/^\[\.Live\]$/)).toBeVisible();
  const roles = await query<{ display_name: string; role: string }>(
    "select a.display_name, m.role from lobby_members m join accounts a on a.id = m.account_id join lobbies l on l.id = m.lobby_id where l.code = $1 order by a.display_name", [code]);
  expect(roles).toEqual([{ display_name: "Guest", role: "participant" }, { display_name: "Host", role: "spectator" }]);
});

for (const locale of ["fr-CA", "en-US"] as const) {
  for (const theme of ["abysse", "aube"] as const) {
    test(`physical keyboard guidance, preserved progress and keyboard abandonment: ${locale} ${theme}`, async ({ browser }) => {
      test.setTimeout(90_000);
      const french = locale === "fr-CA";
      const { page: host } = await signedIn(browser, "Captain", { locale: "en-US", width: 1440 });
      const { page: guest } = await signedIn(browser, "Runner", { locale, width: 768, theme });
      const { page: watcher } = await signedIn(browser, "Watcher", { locale, width: 360, theme });
      const errors: string[] = [];
      guest.on("pageerror", error => errors.push(error.message));
      const code = await openRoom(host);
      // Both forms keep their accessible checkbox at the smallest supported width.
      await guest.setViewportSize({ width: 360, height: 900 });
      await guest.goto("/rooms/new");
      await expect(guest.getByRole("checkbox")).not.toBeChecked();
      await expectNoAccessibilityViolation(guest);
      await expectNoHorizontalScroll(guest);
      await guest.goto(`/rooms/${code}`);
      await expect(guest.getByRole("checkbox")).not.toBeChecked();
      await expectNoAccessibilityViolation(guest);
      await expectNoHorizontalScroll(guest);
      await guest.setViewportSize({ width: 768, height: 900 });
      await expect(guest.getByRole("checkbox")).toBeChecked();
      await guest.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
      await expect(guest.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      await join(watcher, code);
      await host.getByRole("button", { name: "Start the race" }).click();
      const field = guest.getByLabel(french ? "Ta frappe" : "Your typing");
      await expect(field).toBeEnabled({ timeout: 6_000 });
      const text = (await guest.locator(".course-texte").textContent()) ?? "";
      await field.pressSequentially(text.slice(0, 4), { delay: 70 });
      await expect(host.getByRole("progressbar", { name: "Runner" })).toHaveAttribute("value", "4");
      const guidance = guest.getByRole("heading", { name: french ? "Un clavier physique pour courir" : "A physical keyboard to race" });
      for (const width of [1440, 1024, 390, 360, 767]) {
        await guest.setViewportSize({ width, height: 900 });
        if (width < 768) {
          await expect(guidance).toBeVisible();
          await expect(field).toHaveCount(0);
          await expect(guest.locator(".course-texte")).toHaveCount(0);
        } else {
          await expect(field).toBeEnabled();
          await expect(guest.locator(".course-juste")).toHaveCount(4);
        }
        await expect(guest.getByRole("progressbar", { name: "Captain" })).toBeVisible();
        await expectNoHorizontalScroll(guest);
        if (width === 360) await expectNoAccessibilityViolation(guest);
        if ([1440, 1024, 390].includes(width)) {
          await guest.screenshot({ path: test.info().outputPath(`race-${locale}-${theme}-${width}.png`), fullPage: true });
        }
      }
      await guest.keyboard.type(text.slice(4, 7));
      await guest.setViewportSize({ width: 768, height: 900 });
      await expect(field).toBeEnabled();
      await expect(guest.locator(".course-juste")).toHaveCount(4);
      await field.pressSequentially(text.slice(4, 5), { delay: 70 });
      await expect(host.getByRole("progressbar", { name: "Runner" })).toHaveAttribute("value", "5");
      await guest.setViewportSize({ width: 360, height: 900 });
      await expect(watcher.getByRole("heading", { name: french ? "Un clavier physique pour courir" : "A physical keyboard to race" })).toBeVisible();
      await expect(watcher.getByRole("progressbar", { name: "Runner" })).toHaveAttribute("value", "5");
      await expect(watcher.getByRole("button", { name: /^(Abandonner la course|Give up the race)$/ })).toHaveCount(0);
      const abandon = guest.getByRole("button", { name: french ? "Abandonner la course" : "Give up the race", exact: true });
      await abandon.focus();
      await guest.keyboard.press("Enter");
      await expect(guest.getByRole("heading", { name: french ? "Abandonner la course ?" : "Give up the race?" })).toBeFocused();
      await guest.keyboard.press("Escape");
      await expect(abandon).toBeFocused();
      await guest.keyboard.press("Enter");
      await guest.getByRole("button", { name: french ? "Oui, abandonner" : "Yes, give up" }).focus();
      await guest.keyboard.press("Enter");
      await expect(guest.locator("#race-typing-status")).toBeFocused();
      await expect(guest.locator("#race-typing-status")).toContainText(french ? "Tu as abandonné" : "You gave up");
      await expect(abandon).toHaveCount(0);
      await expectNoAccessibilityViolation(guest);
      expect(errors).toEqual([]);
    });
  }
}
