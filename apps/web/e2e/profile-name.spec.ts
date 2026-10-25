import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import { ENGLISH, expectNoAccessibilityViolation, expectNoHorizontalScroll, FRENCH, query, signInWithCredentials } from "./support";

const account = DEMO_ACCOUNTS[0]!;
test.use({ locale: "fr-CA" });

test("saves the normalized name, preserves invalid input and keeps the login/session", async ({ page }) => {
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  const before = await query("select id, login, login_canonical, password_hash, session_version from accounts where login = $1", [account.login]);
  const input = page.getByLabel("Nom d’affichage", { exact: true });
  await input.fill("  Ｍarin   Libre  ");
  await input.press("Tab");
  await expect(page.getByRole("button", { name: "Enregistrer le nom", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toHaveText("Nom enregistré.");
  await expect(input).toHaveValue("Marin Libre");
  await expect(page.getByText("Marin Libre", { exact: true })).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue("Marin Libre");
  await input.fill("a".repeat(41));
  await page.getByRole("button", { name: "Enregistrer le nom", exact: true }).click();
  await expect(input).toHaveAttribute("aria-invalid", "true");
  await expect(input).toHaveValue("a".repeat(41));
  await expect(page.locator("#display-name-error")).toHaveAttribute("role", "alert");
  await expect(page.locator("#display-name-error")).toContainText("Vérifie ton nom");
  await expect(page.getByText("Marin Libre", { exact: true })).toBeVisible();
  expect(await query("select id, login, login_canonical, password_hash, session_version from accounts where login = $1", [account.login])).toEqual(before);
  await page.reload();
  await expect(input).toHaveValue("Marin Libre");
});

test("progressively enhances the same protected form without JavaScript", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "fr-CA" });
  const page = await context.newPage();
  await page.goto(`${baseURL}/account`);
  await expect(page).toHaveURL(/\/sign-in/);
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  await page.getByLabel("Nom d’affichage", { exact: true }).fill("Marin sans JS");
  await page.getByRole("button", { name: "Enregistrer le nom", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Nom enregistré.");
  await expect(page.getByLabel("Nom d’affichage", { exact: true })).toHaveValue("Marin sans JS");
  await page.reload();
  await expect(page.getByLabel("Nom d’affichage", { exact: true })).toHaveValue("Marin sans JS");
  await context.close();
});

test("renders the scoped profile controls in both languages/themes and reference widths", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  for (const locale of ["fr", "en"] as const) {
    for (const theme of ["abysse", "aube"] as const) {
      const context = await browser.newContext({ locale, viewport: { width: 360, height: 900 }, reducedMotion: "reduce" });
      await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
      const page = await context.newPage();
      await signInWithCredentials(page, account.login, account.password, locale === "fr" ? FRENCH : ENGLISH);
      await expect(page).toHaveURL(/\/account$/);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectNoAccessibilityViolation(page);
      await expectNoHorizontalScroll(page);
      await expect(page.locator("main .bg-action")).toHaveCount(1);
      const input = page.getByLabel(locale === "fr" ? "Nom d’affichage" : "Display name", { exact: true });
      await input.fill(" ");
      await page.getByRole("button", { name: locale === "fr" ? "Enregistrer le nom" : "Save display name", exact: true }).click();
      await expect(input).toHaveAttribute("aria-invalid", "true");
      await expectNoAccessibilityViolation(page);
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await expectNoHorizontalScroll(page);
        if (process.env.PROFILE_NAME_SCREENSHOTS) await page.screenshot({ path: `${process.env.PROFILE_NAME_SCREENSHOTS}/profile-${locale}-${theme}-${width}.png`, fullPage: true });
      }
      await context.close();
    }
  }
});
