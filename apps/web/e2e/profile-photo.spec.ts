import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { ENGLISH, expectNoAccessibilityViolation, expectNoHorizontalScroll, FRENCH, query, signInWithCredentials } from "./support";

const account = DEMO_ACCOUNTS[0]!;
test.use({ locale: "fr-CA" });
async function photo(format: "png" | "jpeg" | "webp" = "png", background = "navy") {
  return sharp({ create: { width: 400, height: 300, channels: 3, background } })
    .withExif({ IFD0: { Artist: "private fixture metadata" } }).toFormat(format).toBuffer();
}

test("saves only a normalized private image, survives reload, and preserves it after refusal", async ({ page, request }) => {
  expect((await request.get("/api/account/photo")).status()).toBe(401);
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  const before = await query("select * from accounts where login = $1", [account.login]);
  const input = page.getByLabel("Photo de profil", { exact: true });
  await input.setInputFiles({ name: "anything.txt", mimeType: "text/plain", buffer: await photo() });
  await input.press("Tab");
  await expect(page.getByRole("button", { name: "Enregistrer la photo", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Photo enregistrée.", { exact: true })).toBeVisible();
  const image = page.getByAltText("Ta photo de profil");
  await expect(image).toBeVisible();
  const firstUrl = await image.getAttribute("src");
  const response = await page.request.get("/api/account/photo?accountId=victim");
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("private, no-store");
  const stored = await response.body();
  const metadata = await sharp(stored).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 256, height: 256 });
  expect(metadata.exif).toBeUndefined();
  await page.reload(); await expect(image).toBeVisible();
  for (const buffer of [Buffer.from("not an image"), Buffer.alloc(2 * 1024 * 1024 + 1)]) {
    await input.setInputFiles({ name: "fake.png", mimeType: "image/png", buffer });
    await page.getByRole("button", { name: "Enregistrer la photo", exact: true }).click();
    await expect(page.locator("#profile-photo-error")).toBeVisible();
    expect(await (await page.request.get("/api/account/photo")).body()).toEqual(stored);
  }
  await input.setInputFiles({ name: "second.jpg", mimeType: "image/jpeg", buffer: await photo("jpeg", "white") });
  await page.getByRole("button", { name: "Enregistrer la photo", exact: true }).click();
  await expect(page.getByText("Photo enregistrée.", { exact: true })).toBeVisible();
  await expect(image).not.toHaveAttribute("src", firstUrl!);
  expect(await query("select * from accounts where login = $1", [account.login])).toEqual(before);
  await page.getByRole("button", { name: "Se déconnecter", exact: true }).click();
  expect((await page.request.get("/api/account/photo")).status()).toBe(401);
});

test("uploads a maximum-size image without JavaScript and keeps other accounts isolated", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "fr-CA" });
  const page = await context.newPage(); await page.goto(`${baseURL}/account`);
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  const original = await photo("jpeg");
  const maximum = Buffer.concat([original, Buffer.alloc(2 * 1024 * 1024 - original.length)]);
  await page.getByLabel("Photo de profil", { exact: true }).setInputFiles({ name: "large.jpg", mimeType: "image/jpeg", buffer: maximum });
  await page.getByRole("button", { name: "Enregistrer la photo", exact: true }).click();
  await expect(page.getByText("Photo enregistrée.", { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByAltText("Ta photo de profil")).toBeVisible();
  await context.close();
  const otherContext = await browser.newContext({ locale: "fr-CA" });
  const other = await otherContext.newPage(); await other.goto(`${baseURL}/sign-in`);
  await signInWithCredentials(other, DEMO_ACCOUNTS[1]!.login, DEMO_ACCOUNTS[1]!.password);
  await expect(other).toHaveURL(/\/account$/);
  expect((await other.request.get("/api/account/photo?accountId=" + account.login)).status()).toBe(404);
  await otherContext.close();
});

test("photo form is accessible in both locales/themes and reference widths", async ({ browser, baseURL }) => {
  test.setTimeout(90_000);
  for (const locale of ["fr", "en"] as const) for (const theme of ["abysse", "aube"] as const) {
    const context = await browser.newContext({ locale, viewport: { width: 360, height: 1000 }, reducedMotion: "reduce" });
    await context.addCookies([{ name: "theme", value: theme, url: baseURL! }]);
    const page = await context.newPage();
    await signInWithCredentials(page, account.login, account.password, locale === "fr" ? FRENCH : ENGLISH);
    await expect(page).toHaveURL(/\/account$/);
    await expectNoAccessibilityViolation(page); await expectNoHorizontalScroll(page);
    await expect(page.locator("main .bg-action")).toHaveCount(1);
    await page.locator("#profile-photo").setInputFiles({ name: "bad.png", mimeType: "image/png", buffer: Buffer.from("bad") });
    await page.getByRole("button", { name: locale === "fr" ? "Enregistrer la photo" : "Save photo", exact: true }).click();
    await expect(page.locator("#profile-photo-error")).toHaveAttribute("role", "alert");
    await expectNoAccessibilityViolation(page);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1100 }); await expectNoHorizontalScroll(page);
      if (process.env.PROFILE_PHOTO_SCREENSHOTS) await page.screenshot({ path: `${process.env.PROFILE_PHOTO_SCREENSHOTS}/photo-${locale}-${theme}-${width}.png`, fullPage: true });
    }
    await context.close();
  }
});
