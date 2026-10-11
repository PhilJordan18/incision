import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * The first complete race (F-04.0) in real browsers: two accounts, the countdown on the server's
 * clock, typing validated by the engine on the server, everyone's progress, the results saved and
 * read again. The host's pages are in English, so the race text is the English test fixture
 * (the text follows the host's language, D-19); the guest's pages are in French.
 */
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

async function openRoom(host: Page): Promise<string> {
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: "Open the room" }).click();
  await expect(host).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  await expect(host.getByText("[.Live]")).toBeVisible();
  return host.url().split("/").at(-1) ?? "";
}

async function join(guest: Page, code: string): Promise<void> {
  await guest.goto(`/rooms/${code}`);
  await guest.getByRole("button", { name: "Rejoindre la salle" }).click();
  await expect(guest.getByText("[.En direct]")).toBeVisible();
}

/** The text as the page shows it, grapheme by grapheme. */
async function raceText(page: Page): Promise<string> {
  const text = page.locator(".course-texte");
  await expect(text).toBeVisible();
  return (await text.textContent()) ?? "";
}

/** Types like a person, below the engine's plausibility limit (25 graphemes a second). */
async function typeText(field: ReturnType<Page["getByLabel"]>, text: string): Promise<void> {
  await field.pressSequentially(text, { delay: 70 });
}

test.describe("the first complete race (F-04.0)", () => {
  test("two players race: countdown, typing checked by the server, progress, results stored and reopened", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA" });
    const code = await openRoom(host);
    await expect(host.getByRole("button", { name: "Start the race" })).toBeDisabled();
    await join(guest, code);
    // Only the host has the start, the waiting room's one red action.
    await expect(guest.getByRole("button", { name: "Lancer la course" })).toHaveCount(0);
    const start = host.getByRole("button", { name: "Start the race" });
    await expect(start).toBeEnabled();
    await expectNoAccessibilityViolation(host);
    await start.click();

    // The 3-2-1 countdown on both sides, then the text, in the host's language.
    await expect(guest.getByRole("timer")).toBeVisible();
    await expect(host.getByRole("timer")).toBeVisible();
    const text = await raceText(guest);
    expect(text).toBe("Test text: the sea is calm and the wind rises.");
    await expectNoAccessibilityViolation(guest);
    const hostField = host.getByLabel("Your typing");
    const guestField = guest.getByLabel("Ta frappe");
    await expect(hostField).toBeEnabled({ timeout: 6_000 });
    await expect(guestField).toBeEnabled();

    // Paste and drop are refused: a pasted text never becomes keystrokes (screen 08).
    await guestField.evaluate((field) => {
      field.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", data: "Test text", bubbles: true, cancelable: true }));
      const data = new DataTransfer();
      data.setData("text/plain", "Test text");
      field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(guest.locator(".course-texte .course-juste")).toHaveCount(0);
    await expect(guestField).toHaveValue("");
    // A wrong letter is blocked in mandatory correction (D-19) until fixed.
    await guestField.press("x");
    await expect(guest.getByText("Corrige le « T » encadré pour avancer.")).toBeVisible();
    await expect(guestField).toHaveAttribute("aria-invalid", "true");
    await guestField.press("Backspace");

    // A third account cannot come in during the race (SALLE-09).
    const { page: late } = await signedIn(browser, "Retardataire", { locale: "fr-CA" });
    await late.goto(`/rooms/${code}`);
    await expect(late.getByRole("heading", { level: 1 })).toContainText(/Course/i);
    await expect(late.getByRole("button", { name: "Rejoindre la salle" })).toHaveCount(0);

    await typeText(hostField, text.slice(0, 20));
    // The guest sees the host's progress live (COURSE-05), from the server.
    await expect(guest.getByRole("progressbar", { name: "Capitaine" })).not.toHaveAttribute("value", "0");
    await Promise.all([typeText(hostField, text.slice(20)), typeText(guestField, text)]);

    // Results, read from the database once saved: arrival order (COURSE-10), measures from the engine.
    await expect(host.getByRole("heading", { name: /End of the crossing/i })).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });
    const rows = host.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("1st");
    await expect(rows.nth(1)).toContainText("Capitaine");
    await expect(guest.getByRole("table").getByRole("row").nth(2)).toContainText("Matelot");
    await expectNoAccessibilityViolation(host);
    // The results take the focus when the race ends (WCAG 2.4.3).
    await expect(host.getByRole("heading", { level: 1 })).toBeFocused();

    // The race page, rebuilt from the stored snapshot, after a reload too (HIST-02).
    await guest.getByRole("link", { name: "Voir la fiche de la course" }).click();
    await expect(guest).toHaveURL(/\/races\/[0-9a-f-]{36}$/);
    await guest.reload();
    await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible();
    await expect(guest.getByRole("table").getByRole("row")).toHaveCount(3);
    await expectNoAccessibilityViolation(guest);
    // Not an entrant: the same "not found" as an unknown race.
    await late.goto(guest.url());
    await expect(late.getByRole("heading", { level: 1 })).toHaveText("Course introuvable");
  });

  test("a second tab of the same player watches, takes the input on request, and a reload resumes from the server", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest, context } = await signedIn(browser, "Matelot", { locale: "fr-CA" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(guest);
    const field = guest.getByLabel("Ta frappe");
    await expect(field).toBeEnabled({ timeout: 6_000 });
    await typeText(field, text.slice(0, 6));

    const second = await context.newPage();
    await second.goto(`/rooms/${code}`);
    await expect(second.getByText("Tu tapes dans un autre onglet ; celui-ci regarde.")).toBeVisible();
    await expect(second.getByLabel("Ta frappe")).toBeDisabled();
    await second.getByRole("button", { name: "Taper dans cet onglet" }).click();
    await expect(second.getByLabel("Ta frappe")).toBeEnabled();
    await expect(guest.getByText("Tu tapes dans un autre onglet ; celui-ci regarde.")).toBeVisible();
    await typeText(second.getByLabel("Ta frappe"), text.slice(6, 10));

    // A reload: the page comes back with what the server applied, and goes on from there.
    await second.reload();
    await expect(second.locator(".course-texte .course-juste")).toHaveCount(10);
    // The reloaded tab takes the input once its former connection is gone; if the server has not
    // seen that connection close yet, the tab observes and asks for it explicitly.
    const takeOver = second.getByRole("button", { name: "Taper dans cet onglet" });
    if (await takeOver.isVisible()) {
      await takeOver.click();
    }
    await expect(second.getByLabel("Ta frappe")).toBeEnabled();
    await typeText(second.getByLabel("Ta frappe"), text.slice(10));
    await typeText(host.getByLabel("Your typing"), text);
    await expect(second.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });
  });

  test("a player who leaves during the race abandons, and keeps a ranked result", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA", width: 360, theme: "aube" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(guest);
    await expect(guest.getByLabel("Ta frappe")).toBeEnabled({ timeout: 6_000 });
    await expectNoHorizontalScroll(guest);
    await typeText(guest.getByLabel("Ta frappe"), text.slice(0, 5));
    await guest.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest).toHaveURL(/\/$/);

    await typeText(host.getByLabel("Your typing"), text);
    await expect(host.getByRole("heading", { name: /End of the crossing/i })).toBeVisible({ timeout: 15_000 });
    const rows = host.getByRole("table").getByRole("row");
    await expect(rows.nth(2)).toContainText("Matelot");
    await expect(rows.nth(2)).toContainText("abandoned");
    // The results at 360 px: no horizontal page scroll, and the table's region reachable by keyboard.
    await host.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalScroll(host);
    await expectNoAccessibilityViolation(host);
  });
});
