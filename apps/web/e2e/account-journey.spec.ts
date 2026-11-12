import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map(context => context.close())); });
async function account(browser: Browser, locale: string) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Journey account') returning id,session_version");
  if (!row) throw new Error("Missing synthetic account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
  await context.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
  return { context, page: await context.newPage() };
}
async function audit(page: Page, name: string) {
  for (const theme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: theme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme === "light" ? "aube" : "abysse");
    for (const width of [390, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
      await page.screenshot({ path: test.info().outputPath(`${name}-${theme}-${width}.png`), fullPage: true });
    }
  }
}
for (const locale of ["fr-CA", "en-US"]) {
  test(`account separates the active private room from past races (${locale})`, async ({ browser }) => {
    test.slow();
    const owner = await account(browser, locale);
    await owner.page.goto("/rooms/new");
    await owner.page.getByRole("radio", { name: /^(Privée|Private)$/ }).check();
    await owner.page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
    await expect(owner.page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
    const roomURL = owner.page.url(); const code = roomURL.split("/").at(-1)!;
    const profile = await owner.context.newPage(); await profile.goto("/account");
    const rooms = profile.getByRole("region", { name: /^(Mes salles|My rooms)$/ });
    const history = profile.getByRole("region", { name: /^(Mes courses|My races)$/ });
    const back = rooms.getByRole("link");
    await expect(back).toHaveAttribute("href", `/rooms/${code}`);
    await expect(history.getByRole("link")).toHaveAttribute("href", "/history");
    await audit(profile, "account");
    await back.focus(); await expect(back).toBeFocused(); await back.press("Enter");
    await expect(profile).toHaveURL(roomURL); await expect(profile.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
    const other = await account(browser, locale); await other.page.goto("/account");
    await expect(other.page.getByRole("region", { name: /^(Mes salles|My rooms)$/ }).getByRole("link")).toHaveCount(0);
    await expect(other.page.getByText(code, { exact: false })).toHaveCount(0);
    await profile.goto("/account"); await history.getByRole("link").click(); await expect(profile).toHaveURL(/\/history$/);
    // A click does not acknowledge the asynchronous close action. Keep its request pending
    // to prove that the account correctly lists the room until the server confirms closure.
    let releaseClose!: () => void;
    let closeRequested!: () => void;
    const closeHeld = new Promise<void>(resolve => { releaseClose = resolve; });
    const requestSeen = new Promise<void>(resolve => { closeRequested = resolve; });
    await owner.page.route(roomURL, async route => {
      if (route.request().method() === "POST") { closeRequested(); await closeHeld; }
      await route.continue();
    });
    await owner.page.getByRole("button", { name: /^(Fermer la salle|Close the room)$/, exact: true }).click();
    try {
      await owner.page.getByRole("button", { name: /^(Oui, fermer la salle|Yes, close the room)$/ }).click();
      await requestSeen;
      await profile.goto("/account"); await expect(rooms.getByRole("link")).toHaveAttribute("href", `/rooms/${code}`);
    } finally { releaseClose(); }
    await expect(owner.page.getByRole("heading", { level: 1 })).toHaveText(/Salle\s*fermée|Room\s*closed/i);
    await profile.goto("/account"); await expect(rooms.getByRole("link")).toHaveCount(0);
  });
  test(`home explains existing play and guests have no personal navigation (${locale})`, async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
    const page = await context.newPage(); await page.goto("/");
    await expect(page.getByRole("region", { name: /^(Les repères de ta traversée|Chart your course)$/ }).getByRole("listitem")).toHaveCount(4);
    await audit(page, "home");
    const origin = test.info().project.use.baseURL ?? "";
    expect((await context.request.post(`${origin}/api/guest/session`, { headers: { Origin: origin }, data: { nickname: "Journey visitor" } })).status()).toBe(200);
    expect((await context.cookies()).some(cookie => cookie.name === "incision.guest")).toBe(true);
    await page.goto("/account"); await expect(page).toHaveURL(/\/sign-in/);
    await expect(page.getByRole("link", { name: /^(Mes salles|My rooms|Mes courses|My races)$/ })).toHaveCount(0);
  });
}
