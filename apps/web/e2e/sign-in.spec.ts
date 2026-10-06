import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import { ENGLISH, FRENCH, signInWithCredentials } from "./support";

const [alice] = DEMO_ACCOUNTS;
if (alice === undefined) {
  throw new Error("No demo account");
}

test.describe("sign-in page in French (TEST-03)", () => {
  test.use({ locale: "fr-CA" });

  test("is translated, with labelled fields and the providers", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page).toHaveTitle("Connexion · Incision");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    await expect(page.getByRole("heading", { level: 1, name: "Bon retour" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter avec GitHub" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter avec Discord" })).toBeVisible();
    await expect(page.getByLabel(FRENCH.login, { exact: true })).toHaveAttribute("autocomplete", "username");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveAttribute("type", "password");
  });

  test("answers the same generic error for a wrong password and an unknown login", async ({ page }) => {
    await signInWithCredentials(page, alice.login, "not-the-password");
    const wrongPassword = page.getByRole("main").getByRole("alert");
    await expect(wrongPassword).toContainText("Nom d’utilisateur ou mot de passe incorrect.");
    await expect(page.getByLabel(FRENCH.login, { exact: true })).toHaveValue(alice.login);
    await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");

    await signInWithCredentials(page, "nobody-here", "not-the-password");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Nom d’utilisateur ou mot de passe incorrect.");
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test("explains missing fields next to them", async ({ page }) => {
    await page.goto("/sign-in");
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    const login = page.getByLabel(FRENCH.login, { exact: true });
    await expect(login).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(`#${await login.getAttribute("aria-describedby")}`)).toContainText("Saisis ton nom d’utilisateur.");
    await expect(page.getByText("Saisis ton mot de passe.")).toBeVisible();
  });

  test("pauses a login after repeated failures, with a translated message", async ({ page }) => {
    // A login that does not exist, so the demo accounts stay usable by the other tests.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await signInWithCredentials(page, "rate-limit-probe", `wrong-${attempt}`);
      await expect(page.getByRole("main").getByRole("alert")).toContainText("Nom d’utilisateur ou mot de passe incorrect.");
    }
    await signInWithCredentials(page, "rate-limit-probe", "wrong-again");
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Trop de tentatives. Réessaie dans quelques minutes.");
  });

  test("can be completed with the keyboard only", async ({ page }) => {
    await page.goto("/sign-in");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Aller au contenu" })).toBeFocused();
    await page.getByLabel(FRENCH.login, { exact: true }).focus();
    await page.keyboard.type(alice.login);
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Mot de passe", { exact: true })).toBeFocused();
    await page.keyboard.type(alice.password);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  });
});

test.describe("sign-in page in English", () => {
  test.use({ locale: "en-US" });

  test("follows the browser language, including errors and the account page", async ({ page }) => {
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1, name: "Welcome back" })).toBeVisible();
    await signInWithCredentials(page, alice.login, "not-the-password", ENGLISH);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Incorrect username or password.");
    await signInWithCredentials(page, alice.login, alice.password, ENGLISH);
    await expect(page.getByRole("heading", { level: 1, name: "My account" })).toBeVisible();
    await expect(page.getByText("Signing out ends all your sessions, on every device.")).toBeVisible();
  });

  test("keeps an explicit language cookie over the browser language", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "locale", value: "fr", url: baseURL ?? "" }]);
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Bon retour" })).toBeVisible();
    await expect(page.getByLabel(FRENCH.login, { exact: true })).toBeVisible();
  });
});
