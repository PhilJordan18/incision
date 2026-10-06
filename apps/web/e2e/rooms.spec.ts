import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, query, signInWithCredentials } from "./support";

const [alice, bruno] = DEMO_ACCOUNTS;
if (alice === undefined || bruno === undefined) {
  throw new Error("Two demo accounts are needed");
}

test.use({ locale: "fr-CA" });

const contexts: BrowserContext[] = [];

// Each test starts with no room: the demo accounts are shared by every spec.
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});

// Their sockets must not outlive the test.
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

async function signedInPage(
  browser: Browser,
  account: { login: string; password: string },
  options: { theme?: "abysse" | "aube"; width?: number } = {},
): Promise<Page> {
  const context = await browser.newContext({
    locale: "fr-CA",
    ...(options.width === undefined ? {} : { viewport: { width: options.width, height: 800 } }),
  });
  contexts.push(context);
  if (options.theme !== undefined) {
    await context.addCookies([{ name: "theme", value: options.theme, url: test.info().project.use.baseURL ?? "" }]);
  }
  const page = await context.newPage();
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function createRoom(page: Page, role: "participant" | "spectator" = "participant"): Promise<string> {
  await page.goto("/rooms/new");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Préparer la traversée/i);
  if (role === "spectator") {
    await page.getByLabel("Je participe à la course (sinon : spectateur)").uncheck();
  }
  await page.getByRole("button", { name: "Ouvrir la salle" }).click();
  await expect(page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  const code = page.url().split("/").at(-1) ?? "";
  await expect(page.getByText("[.En direct]")).toBeVisible();
  return code;
}

function crew(page: Page) {
  return page.getByRole("region", { name: "Équipage" }).getByRole("listitem");
}

test.describe("rooms by code with live presence (CP-06)", () => {
  test("A creates a room, B joins with the code, both see the crew change live", async ({ browser }) => {
    const host = await signedInPage(browser, alice);
    const code = await createRoom(host);
    await expect(crew(host)).toHaveCount(1);
    await expect(crew(host).first()).toContainText("Hôte");
    await expect(host.getByRole("region", { name: "Code de la salle" })).toContainText(code);

    const guest = await signedInPage(browser, bruno);
    await guest.goto("/");
    await guest.getByLabel("Code de salle", { exact: true }).fill(code.toLowerCase());
    await guest.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(guest).toHaveURL(new RegExp(`/rooms/${code}$`));
    await expect(crew(guest)).toHaveCount(2);

    // No reload on the host's side: the new member arrives over Socket.IO, online.
    await expect(crew(host)).toHaveCount(2);
    await expect(crew(host).filter({ hasText: bruno.displayName })).toContainText("en ligne");

    // A second tab of the same account is the same member, not a new one.
    const secondTab = await guest.context().newPage();
    await secondTab.goto(`/rooms/${code}`);
    await expect(crew(secondTab)).toHaveCount(2);
    await expect(crew(host)).toHaveCount(2);

    // B leaves: A sees it at once; B's other tab says so and offers to come back.
    await guest.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest).toHaveURL(/\/$/);
    await expect(crew(host)).toHaveCount(1);
    await expect(secondTab.getByRole("heading", { level: 1 })).toHaveText(/Tu as quitté la salle/i);
    await expect(secondTab.getByRole("heading", { level: 1 })).toBeFocused();
    await secondTab.getByRole("link", { name: "Rejoindre à nouveau" }).click();
    await expect(secondTab.getByRole("button", { name: "Rejoindre la salle" })).toBeVisible();
  });

  test("refuses unknown and invalid codes with translated messages", async ({ browser }) => {
    const page = await signedInPage(browser, bruno);
    await page.goto("/");
    const field = page.getByLabel("Code de salle", { exact: true });
    await field.fill("ZZZZZZ");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page.getByText("Aucune salle ouverte avec ce code. Vérifie les 6 caractères.")).toBeVisible();
    await expect(field).toBeFocused();
  });

  test("answers an unknown room's page with one not-found page", async ({ browser }) => {
    const page = await signedInPage(browser, bruno);
    const response = await page.goto("/rooms/ZZZZZZ");
    expect(response?.status()).toBe(404);
    await expect(page).toHaveTitle("Page introuvable · Incision");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(page.getByRole("banner")).toHaveCount(1);
  });

  test("keeps one room per person and offers to leave the current one", async ({ browser }) => {
    const host = await signedInPage(browser, alice);
    const code = await createRoom(host);
    const other = await signedInPage(browser, bruno);
    const otherCode = await createRoom(other);

    await other.goto(`/rooms/${code}`);
    await expect(other.getByText(`Tu es déjà dans la salle ${otherCode}.`)).toBeVisible();
    // Bruno hosts his room: the button says what leaving does.
    const leave = other.getByRole("button", { name: `Quitter la salle ${otherCode} et revenir ici` });
    await expect(leave).toHaveAccessibleDescription("Si tu quittes en tant qu’hôte, la salle se ferme pour tout le monde.");
    await leave.click();
    await expect(other).toHaveURL(new RegExp(`/rooms/${code}$`));
    await other.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(crew(other)).toHaveCount(2);

    await other.goto("/rooms/new");
    await expect(other.getByText(`Tu es déjà dans la salle ${code}.`)).toBeVisible();
  });

  test("closes the room for everyone when the host leaves, and says so to latecomers", async ({ browser }) => {
    const host = await signedInPage(browser, alice);
    const code = await createRoom(host, "spectator");
    await expect(crew(host).first()).toContainText("spectateur");
    const guest = await signedInPage(browser, bruno);
    await guest.goto(`/rooms/${code}`);
    await guest.getByLabel("Je participe à la course (sinon : spectateur)").uncheck();
    await guest.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(crew(guest)).toHaveCount(2);
    await expect(crew(guest).filter({ hasText: bruno.displayName })).toContainText("spectateur");

    await host.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest.getByRole("heading", { level: 1 })).toHaveText(/Salle fermée/i);
    await expect(guest.getByText(`L’hôte a quitté la salle ${code} : elle est fermée pour tout le monde.`)).toBeVisible();

    // An old link to the room shows the closed state, without a join button.
    await guest.goto(`/rooms/${code}`);
    await expect(guest.getByRole("heading", { level: 1 })).toHaveText(/Salle fermée/i);
    await expect(guest.getByRole("button", { name: "Rejoindre la salle" })).toHaveCount(0);
  });

  test("tells a member whose session ended elsewhere how to come back", async ({ browser }) => {
    const host = await signedInPage(browser, alice);
    const code = await createRoom(host);
    const laptop = await signedInPage(browser, alice);
    await laptop.goto("/account");
    await laptop.getByRole("button", { name: "Se déconnecter" }).click();

    await expect(host.getByRole("heading", { level: 1 })).toHaveText(/Tu es déconnecté/i);
    await host.getByRole("link", { name: "Me reconnecter" }).click();
    await expect(host).toHaveURL(new RegExp(`/sign-in\\?callbackUrl=%2Frooms%2F${code}$`));
    await host.getByLabel("Nom d’utilisateur", { exact: true }).fill(alice.login);
    await host.getByLabel("Mot de passe", { exact: true }).fill(alice.password);
    await host.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(host).toHaveURL(new RegExp(`/rooms/${code}$`));
    await expect(host.getByText("[.En direct]")).toBeVisible();
  });

  test("needs a session to create or open a room", async ({ page }) => {
    await page.goto("/rooms/new");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Frooms%2Fnew$/);
    await page.goto("/rooms/B7K4PQ");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Frooms%2FB7K4PQ$/);
  });

  for (const theme of ["abysse", "aube"] as const) {
    test(`room pages have no WCAG A/AA violation and fit 360 px in ${theme}`, async ({ browser }) => {
      const host = await signedInPage(browser, alice, { theme, width: 360 });
      await host.goto("/rooms/new");
      await expectNoAccessibilityViolation(host);
      await expectNoHorizontalScroll(host);
      const code = await createRoom(host);
      await expectNoAccessibilityViolation(host);
      await expectNoHorizontalScroll(host);

      const guest = await signedInPage(browser, bruno, { theme, width: 360 });
      await guest.goto(`/rooms/${code}`);
      await expect(guest.getByRole("button", { name: "Rejoindre la salle" })).toBeVisible();
      await expectNoAccessibilityViolation(guest);
      await expectNoHorizontalScroll(guest);
    });
  }
});
