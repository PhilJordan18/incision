import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, signInWithCredentials } from "./support";

const [, bruno] = DEMO_ACCOUNTS;
if (bruno === undefined) {
  throw new Error("No second demo account");
}

test.use({ locale: "fr-CA" });

test.describe("theme (DES-05)", () => {
  test("follows the system before any choice, from the inline script alone", async ({ browser, baseURL }) => {
    for (const [colorScheme, theme] of [
      ["light", "aube"],
      ["dark", "abysse"],
    ] as const) {
      const context = await browser.newContext({ colorScheme, locale: "fr-CA" });
      // No application script can run: only the inline script in the HTML can set the theme.
      await context.route("**/_next/static/**/*.js", (route) => route.abort());
      const page = await context.newPage();
      await page.goto(baseURL ?? "");
      await expect(page.locator("html")).toHaveAttribute("data-theme-choice", "system");
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
    await expect(code).toBeFocused();
    await expect(page.getByText("Un code compte 6 caractères.")).toBeVisible();
    await code.fill("OOOOOO");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page.getByText("Le code n’utilise que des lettres et des chiffres, sans 0, O, 1, I ni L.")).toBeVisible();
    await code.fill(" b7k4pq ");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    // A valid code without a session: sign in first, then back to the room (CP-06).
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Frooms%2FB7K4PQ$/);
  });

  test("keeps the words of its title apart and fits one desktop screen", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 800 });
    await page.goto("/");
    // Line breaks alone would read "Tape.Dépasse.arrive." in screen readers and reader views.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Tape\.\s+Dépasse\.\s+arrive\.$/);
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("shows my logo, the favicon and a single red action", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('header img[src="/brand/ico-red.svg"]')).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icon\.svg/);
    await expect(page.locator("main .bg-action")).toHaveCount(1);
  });
});

test.describe("unknown URL (apps/web/AGENTS.md)", () => {
  // The rule against notFound() in pages relies on this: app/not-found.tsx is rendered by
  // the server, with the theme, unlike Next's bare error document (`__next_error__`).
  test("answers 404 with the not-found page rendered by the server, readable without JavaScript", async ({ browser, request, baseURL }) => {
    const response = await request.get("/this-page-does-not-exist", { headers: { cookie: "theme=aube" } });
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).not.toContain("__next_error__");
    expect(html).toMatch(/<html[^>]*\sdata-theme-choice="aube"/);

    const context = await browser.newContext({ javaScriptEnabled: false, locale: "fr-CA" });
    await context.addCookies([{ name: "theme", value: "aube", url: baseURL ?? "" }]);
    const page = await context.newPage();
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aube");
    await expect(page.getByText("Erreur 404")).toBeVisible();
    await expect(page.getByText("Cette page n’existe pas ou n’est plus disponible.")).toBeVisible();
    await expect(page).toHaveTitle("Page introuvable · Incision");
    await context.close();
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

  for (const theme of ["abysse", "aube"] as const) {
    test(`has no WCAG A/AA violation on the account page in ${theme}`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
      await signInWithCredentials(page, bruno.login, bruno.password);
      await expect(page).toHaveURL(/\/account$/);
      await expectNoAccessibilityViolation(page);
    });
  }

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
