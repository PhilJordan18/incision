import { expect, test } from "@playwright/test";

// SIMULATED: no request reaches GitHub or Discord. These tests stop the browser at the
// provider's authorisation URL and check what Auth.js asks for. Real GitHub and Discord
// sign-ins are verified by hand, locally and in production (docs/DEPLOYMENT.md).
test.use({ locale: "fr-CA" });

const PROVIDERS = [
  { button: "Se connecter avec GitHub", host: "github.com", path: "/login/oauth/authorize", clientId: "e2e-github-client-id", scope: "", id: "github" },
  { button: "Se connecter avec Discord", host: "discord.com", path: "/api/oauth2/authorize", clientId: "e2e-discord-client-id", scope: "identify", id: "discord" },
] as const;

for (const provider of PROVIDERS) {
  test(`starts a ${provider.id} sign-in with the minimal permissions, without email`, async ({ page, baseURL }) => {
    let authorizeUrl: URL | undefined;
    await page.route(`https://${provider.host}/**`, async (route) => {
      authorizeUrl = new URL(route.request().url());
      await route.fulfill({ status: 200, contentType: "text/plain", body: "simulated provider" });
    });
    await page.goto("/sign-in?callbackUrl=%2Faccount");
    await page.getByRole("button", { name: provider.button }).click();
    await expect(page.getByText("simulated provider")).toBeVisible();

    expect(authorizeUrl?.pathname).toBe(provider.path);
    const params = authorizeUrl?.searchParams;
    expect(params?.get("client_id")).toBe(provider.clientId);
    expect(params?.get("scope")).toBe(provider.scope);
    expect(params?.get("redirect_uri")).toBe(`${baseURL ?? ""}/api/auth/callback/${provider.id}`);
    expect(params?.get("response_type")).toBe("code");
    expect(params?.get("code_challenge_method")).toBe("S256");
    expect(params?.get("scope") ?? "").not.toMatch(/email/);
  });
}

test("brings a cancelled GitHub sign-in back to the sign-in page with a translated message", async ({ page, baseURL }) => {
  // The simulated provider answers like GitHub when the user clicks "Cancel": back to
  // our callback with error=access_denied, which Auth.js handles for real.
  await page.route("https://github.com/**", async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state") ?? "";
    const callback = new URL(`${baseURL ?? ""}/api/auth/callback/github`);
    callback.search = new URLSearchParams({ error: "access_denied", state }).toString();
    await route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: PROVIDERS[0].button }).click();
  await expect(page).toHaveURL(/\/sign-in\?/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("La connexion avec le fournisseur a été annulée ou a échoué. Réessaie.");
});

test("accepts Discord's issuer parameter: a cancelled Discord sign-in gets the translated message", async ({ page, baseURL }) => {
  // Discord adds `iss=https://discord.com` to its redirects (RFC 9207, declared in its
  // metadata). Auth.js compares it with the provider's issuer before reading the error.
  await page.route("https://discord.com/**", async (route) => {
    const state = new URL(route.request().url()).searchParams.get("state") ?? "";
    const callback = new URL(`${baseURL ?? ""}/api/auth/callback/discord`);
    callback.search = new URLSearchParams({ error: "access_denied", state, iss: "https://discord.com" }).toString();
    await route.fulfill({ status: 302, headers: { location: callback.toString() } });
  });
  await page.goto("/sign-in");
  await page.getByRole("button", { name: PROVIDERS[1].button }).click();
  await expect(page).toHaveURL(/\/sign-in\?/);
  await expect(page.getByRole("main").getByRole("alert")).toContainText("La connexion avec le fournisseur a été annulée ou a échoué. Réessaie.");
});

test("shows Auth.js' refused-access errors on the translated error page", async ({ page }) => {
  await page.goto("/auth/error?error=AccessDenied");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("La connexion a été refusée ou annulée. Tu peux réessayer avec un autre moyen.");
});

test("refuses the built-in sign-out endpoint: signing out goes through the account page", async ({ request }) => {
  const response = await request.post("/api/auth/signout", { form: { csrfToken: "irrelevant" } });
  expect(response.status()).toBe(405);
});
