import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

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
      const memberPanel = member.getByRole("region", { name: /^(Capacité de la salle|Room capacity)$/ });
      await expect(memberPanel.getByRole("button", { name: /^(Modifier la capacité|Edit capacity)$/ })).toHaveCount(0);
      await panel.getByRole("button", { name: /^(Modifier la capacité|Edit capacity)$/ }).focus();
      await page.keyboard.press("Enter");
      const input = panel.getByRole("spinbutton");
      for (const value of ["1", "31", "2.5"]) {
        await input.fill(value);
        await expect(panel.getByRole("button", { name: /^(Enregistrer la capacité|Save capacity)$/ })).toBeDisabled();
      }
      await input.fill("2");
      await panel.getByRole("button", { name: /^(Enregistrer la capacité|Save capacity)$/ }).click();
      await expect(panel.getByRole("status")).toHaveText(/^(Capacité enregistrée\.|Capacity saved\.)$/);
      await expect(memberPanel.getByText(/ : 2$/)).toBeVisible();
      await page.reload();
      await expect(panel.getByText(/ : 2$/)).toBeVisible();
      for (const theme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme: theme });
        for (const width of [1440, 1024, 390, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          await expectNoHorizontalScroll(page);
          await expectNoAccessibilityViolation(page);
          await page.screenshot({ path: test.info().outputPath(`${locale}-${theme}-${width}.png`), fullPage: true });
        }
      }
    } finally { await context.close(); await observerContext.close(); }
  });
}
