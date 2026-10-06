import AxeBuilder from "@axe-core/playwright";
import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, type Page, test } from "@playwright/test";
import { signInWithCredentials } from "./support";

const [, bruno] = DEMO_ACCOUNTS;
if (bruno === undefined) {
  throw new Error("No second demo account");
}

test.use({ locale: "fr-CA" });

/** WCAG 2.1 A and AA rules, contrast included (A11Y-01 to A11Y-04, DA p.26). */
async function expectNoAccessibilityViolation(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("theme (DES-05)", () => {
  test("follows the system before any choice, without waiting for React", async ({ browser, baseURL }) => {
    for (const [colorScheme, theme] of [
      ["light", "aube"],
      ["dark", "abysse"],
    ] as const) {
      const context = await browser.newContext({ colorScheme, locale: "fr-CA", javaScriptEnabled: true });
      const page = await context.newPage();
      // The theme must be set by the inline script while the HTML is parsed.
      await page.goto(baseURL ?? "", { waitUntil: "commit" });
      await page.waitForFunction(() => document.body !== null);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await context.close();
    }
  });

  test("keeps an explicit choice, rendered by the server on the next pages", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Passer au thème clair Aube" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aube");
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aube");
    await expect(page.getByRole("button", { name: "Passer au thème sombre Abysse" })).toBeVisible();

    const html = await (await request.get("/", { headers: { cookie: "theme=aube" } })).text();
    expect(html).toMatch(/<html[^>]*data-theme="aube"/);
  });
});

test.describe("language (I18N-02)", () => {
  test("switches from the header, keeps the choice and translates metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await page.getByRole("button", { name: "English" }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Overtake.");
    await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/sign-in");
    await expect(page).toHaveTitle("Sign in · Incision");
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page).toHaveTitle("Connexion · Incision");
  });
});

test.describe("home (screen 01, JOIN-01)", () => {
  test("checks the room code with the domain rule and explains the error", async ({ page }) => {
    await page.goto("/");
    const code = page.getByLabel("Code de salle", { exact: true });
    await code.fill("ABC");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(code).toHaveAttribute("aria-invalid", "true");
    await expect(page.getByText("Un code compte 6 caractères.")).toBeVisible();
    await code.fill("OOOOOO");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page.getByText("Le code n’utilise que des lettres et des chiffres, sans 0, O, 1, I ni L.")).toBeVisible();
    await code.fill(" b7k4pq ");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page).toHaveURL(/\/rooms\/B7K4PQ$/);
  });

  test("shows Philippe's logo, the favicon and a single red action", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('header img[src="/brand/ico-red.svg"]')).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icon\.svg/);
    await expect(page.locator("main .bg-action")).toHaveCount(1);
  });
});

test.describe("layout and accessibility (DES-06, A11Y)", () => {
  for (const theme of ["abysse", "aube"] as const) {
    test(`has no WCAG A/AA violation on the public pages in ${theme}`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
      for (const path of ["/", "/sign-in", "/auth/error", "/this-page-does-not-exist"]) {
        await page.goto(path);
        await expectNoAccessibilityViolation(page);
      }
    });
  }

  test("has no WCAG A/AA violation on the account page", async ({ page }) => {
    await signInWithCredentials(page, bruno.login, bruno.password);
    await expect(page).toHaveURL(/\/account$/);
    await expectNoAccessibilityViolation(page);
  });

  test("fits 360 px without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/", "/sign-in", "/auth/error", "/this-page-does-not-exist"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await signInWithCredentials(page, bruno.login, bruno.password);
    await expect(page).toHaveURL(/\/account$/);
    await expectNoHorizontalScroll(page);
  });
});
