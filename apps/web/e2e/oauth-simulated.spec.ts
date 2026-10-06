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

test("brings a cancelled provider sign-in back to the sign-in page with a translated message", async ({ page }) => {
  // What Auth.js does when the provider redirects back with an error.
  await page.goto("/sign-in?error=OAuthCallbackError");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("La connexion avec le fournisseur a été annulée ou a échoué. Réessaie.");
  await page.goto("/auth/error?error=AccessDenied");
  await expect(page.getByRole("main").getByRole("alert")).toHaveText("La connexion a été refusée ou annulée. Tu peux réessayer avec un autre moyen.");
});
