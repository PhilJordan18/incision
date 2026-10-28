import { expect, test } from "@playwright/test";
import { forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/** No seeded results: the real runtime generates both curves and the corrected-key aggregate. */
test("a human and scheduled bot produce persisted curves and a private corrected-error heatmap", async ({ browser }) => {
  test.setTimeout(120_000);
  const [account] = await query<{ id: string; session_version: number }>(
    "insert into accounts(display_name) values ('Chart live sailor') returning id,session_version");
  if (!account) throw new Error("fixture account missing");
  const context = await browser.newContext({ locale: "en-US" });
  try {
    await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
      sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000),
    }) }]);
    const page = await context.newPage();
    await page.goto("/rooms/new");
    await page.getByRole("button", { name: "Open the room", exact: true }).click();
    await expect(page.getByText("[.Live]", { exact: true })).toBeVisible();
    const panel = page.getByRole("region", { name: "Bots", exact: true });
    await panel.getByRole("combobox", { name: "Bot level", exact: true }).selectOption("impossible");
    await panel.getByRole("button", { name: "Add a bot", exact: true }).click();
    await expect(panel.getByRole("listitem")).toHaveCount(1);
    await page.getByRole("button", { name: "Start the race", exact: true }).click();
    const field = page.getByLabel("Your typing", { exact: true });
    await expect(field).toBeEnabled({ timeout: 10_000 });
    const text = (await page.locator(".course-texte").textContent())!;
    await field.pressSequentially(text[0] === "x" ? "z" : "x", { delay: 70 });
    await expect(field).toHaveAttribute("aria-invalid", "true");
    await field.press("Backspace");
    await field.pressSequentially(text, { delay: 70 });
    await expect(page.getByRole("heading", { name: /End of the crossing/i })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("link", { name: "Open the race page", exact: true }).click();
    await expect(page).toHaveURL(/\/races\/[0-9a-f-]{36}$/);
    const speed = page.getByRole("region", { name: "Speed during the race", exact: true });
    await expect(speed.locator("svg").first().locator("polyline")).toHaveCount(2);
    await expect(speed).toContainText("Bot · King of the pirates — impossible");
    const heat = page.getByRole("region", { name: "Your missed characters", exact: true });
    await expect(heat).toContainText("Total errors : 1");
    await expect(heat.getByLabel(`${text[0]} — 1 errors`, { exact: true })).toBeVisible();
    await page.reload();
    await expect(heat).toContainText("Total errors : 1");
    await expect(speed.locator("svg").first().locator("polyline")).toHaveCount(2);
  } finally { await context.close(); }
});
