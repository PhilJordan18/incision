import { expect, test, type Page } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

async function applySystemTheme(page: Page, colorScheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme });
  // The matchMedia listener runs asynchronously. Axe must inspect one settled theme,
  // not a mixture of old foreground colours and the new background during switching.
  await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme === "light" ? "aube" : "abysse");
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) =>
      animation.effect?.getComputedTiming().iterations !== Infinity,
    ).map((animation) => animation.finished.catch(() => undefined)));
  });
}

for (const locale of ["fr-CA", "en-CA"]) {
  test(`host capacity persists and refuses invalid bounds (${locale})`, async ({ browser }) => {
    const [row] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ('Capacity host') returning id, session_version");
    if (!row) throw new Error("No fixture account");
    const context = await browser.newContext({ locale, reducedMotion: "reduce" });
    const observerContext = await browser.newContext({ locale, reducedMotion: "reduce" });
    try {
      await context.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
      const page = await context.newPage();
      await page.goto("/rooms/new");
      const creationCapacity = page.getByRole("spinbutton", { name: /^(Nombre maximal de participants|Maximum participants)$/ });
      await expect(creationCapacity).toHaveValue("30");
      await creationCapacity.fill("3");
      for (const theme of ["light", "dark"] as const) {
        await applySystemTheme(page, theme);
        for (const width of [1440, 1024, 390, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          await expectNoHorizontalScroll(page);
          await expectNoAccessibilityViolation(page);
          await page.screenshot({ path: test.info().outputPath(`creation-${locale}-${theme}-${width}.png`), fullPage: true });
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
      await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      const [observer] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ('Capacity observer') returning id, session_version");
      if (!observer) throw new Error("No observer account");
      await observerContext.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: observer.id, sessionVersion: observer.session_version, authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
      const member = await observerContext.newPage();
      await member.goto(page.url());
      await member.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
      await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      const panel = page.getByRole("region", { name: /^(Capacité de la salle|Room capacity)$/ });
      await expect(panel.getByText(/ : 3$/)).toBeVisible();
      const memberPanel = member.getByRole("region", { name: /^(Capacité de la salle|Room capacity)$/ });
      await expect(memberPanel.getByRole("button", { name: /^(Modifier la capacité|Edit capacity)$/ })).toHaveCount(0);
      await panel.getByRole("button", { name: /^(Modifier la capacité|Edit capacity)$/ }).focus();
      await page.keyboard.press("Enter");
      const input = panel.getByRole("spinbutton");
      await expect(input).toBeFocused();
      for (const value of ["1", "31", "2.5"]) {
        await input.fill(value);
        await expect(panel.getByRole("button", { name: /^(Enregistrer la capacité|Save capacity)$/ })).toBeDisabled();
      }
      await input.fill("2");
      await page.keyboard.press("Tab");
      await expect(panel.getByRole("button", { name: /^(Enregistrer la capacité|Save capacity)$/ })).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(panel.getByRole("status")).toHaveText(/^(Capacité enregistrée\.|Capacity saved\.)$/);
      await expect(panel.getByRole("button", { name: /^(Modifier la capacité|Edit capacity)$/ })).toBeFocused();
      await expect(memberPanel.getByText(/ : 2$/)).toBeVisible();
      await page.reload();
      await expect(panel.getByText(/ : 2$/)).toBeVisible();
      for (const theme of ["light", "dark"] as const) {
        await applySystemTheme(page, theme);
        for (const width of [1440, 1024, 390, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          await expectNoHorizontalScroll(page);
          await expectNoAccessibilityViolation(page);
          await page.screenshot({ path: test.info().outputPath(`${locale}-${theme}-${width}.png`), fullPage: true });
        }
      }
    } finally { await context.close(); await observerContext.close(); }
  });

  test(`creation persists selected capacity without JavaScript (${locale})`, async ({ browser }) => {
    const [account] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ('No JS capacity host') returning id, session_version");
    if (!account) throw new Error("No fixture account");
    const context = await browser.newContext({ locale, javaScriptEnabled: false });
    try {
      await context.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
      const page = await context.newPage();
      await page.goto("/rooms/new");
      await page.getByRole("spinbutton", { name: /^(Nombre maximal de participants|Maximum participants)$/ }).fill("2");
      await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
      await expect(page).toHaveURL(/\/rooms\/[A-Z2-9]{6}$/);
      const rows = await query<{ capacity: number }>("select l.capacity from lobbies l join lobby_members m on m.id=l.host_member_id where m.account_id=$1", [account.id]);
      expect(rows).toEqual([{ capacity: 2 }]);
    } finally { await context.close(); }
  });
}
