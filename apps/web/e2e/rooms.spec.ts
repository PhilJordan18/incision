import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { type Browser, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, query, signInWithCredentials } from "./support";

const [alice, bruno] = DEMO_ACCOUNTS;
if (alice === undefined || bruno === undefined) {
  throw new Error("Two demo accounts are needed");
}

test.use({ locale: "fr-CA" });

// Each test starts with no room: the demo accounts are shared by every spec.
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
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
  if (options.theme !== undefined) {
    await context.addCookies([{ name: "theme", value: options.theme, url: test.info().project.use.baseURL ?? "" }]);
  }
  const page = await context.newPage();
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  return page;
}

async function createRoom(page: Page, role: "Je participe" | "Je regarde" = "Je participe"): Promise<string> {
  await page.goto("/rooms/new");
  await page.getByText(role, { exact: true }).click();
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

    // B leaves: A sees it at once.
    await guest.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest).toHaveURL(/\/$/);
    await expect(crew(host)).toHaveCount(1);
    await expect(secondTab.getByRole("main").getByRole("alert")).toContainText("Tu ne fais plus partie de cette salle.");
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

  test("keeps one room per person and offers to leave the current one", async ({ browser }) => {
    const host = await signedInPage(browser, alice);
    const code = await createRoom(host);
    const other = await signedInPage(browser, bruno);
    const otherCode = await createRoom(other);

    await other.goto(`/rooms/${code}`);
    await expect(other.getByText(`Tu es déjà dans la salle ${otherCode}.`)).toBeVisible();
    await other.getByRole("button", { name: `Quitter la salle ${otherCode} et revenir ici` }).click();
    await expect(other).toHaveURL(new RegExp(`/rooms/${code}$`));
    await other.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(crew(other)).toHaveCount(2);

    await other.goto("/rooms/new");
    await expect(other.getByText(`Tu es déjà dans la salle ${code}.`)).toBeVisible();
  });

  test("closes the room for everyone when the host leaves", async ({ browser }) => {
    const host = await signedInPage(browser, alice);
    const code = await createRoom(host, "Je regarde");
    await expect(crew(host).first()).toContainText("spectateur");
    const guest = await signedInPage(browser, bruno);
    await guest.goto(`/rooms/${code}`);
    await guest.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(crew(guest)).toHaveCount(2);

    await host.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest.getByRole("main").getByRole("alert")).toContainText("L’hôte a quitté la salle : elle est fermée.");
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
