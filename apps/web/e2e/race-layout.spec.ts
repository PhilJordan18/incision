import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { trackFixture } from "./track-fixture";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * F-04.3D (#51, Philippe's drawing): the text over the full width, then standings, track and
 * bonuses in one row, then « Ta frappe » under that row. At the desktop sizes the brief names,
 * the text, the track and the pad are on screen together, the pad keeps the focus while the
 * realtime panels refresh, and nothing is hidden or shrunk to get there.
 */
const contexts: BrowserContext[] = [];
let fixture: Awaited<ReturnType<typeof trackFixture>> | undefined;
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async context => { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }));
  await fixture?.close(); fixture = undefined;
});

async function openRace(browser: import("@playwright/test").Browser, { locale, theme, width, height, count = 30, bonuses = true }: {
  locale: "fr-CA" | "en-US"; theme: "aube" | "abysse"; width: number; height: number; count?: number; bonuses?: boolean;
}): Promise<{ page: Page; context: BrowserContext }> {
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('Capitaine') returning id,session_version");
  const context = await browser.newContext({ locale, viewport: { width, height }, reducedMotion: "no-preference" }); contexts.push(context);
  const baseURL = test.info().project.use.baseURL!;
  const token = await forgeSessionCookie({ sub: account!.id, sessionVersion: account!.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }, { name: "theme", value: theme, url: baseURL }]);
  const page = await context.newPage();
  await page.goto("/rooms/new");
  await page.getByRole("button", { name: locale === "fr-CA" ? "Ouvrir la salle" : "Open the room", exact: true }).click();
  await expect(page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  const code = page.url().split("/").at(-1)!;
  const [member] = await query<{ id: string }>("select m.id from lobby_members m join lobbies l on l.id=m.lobby_id where l.code=$1", [code]);
  fixture = await trackFixture({ code, phase: "waiting", capacity: 30, revision: 1000,
    members: [{ memberId: member!.id, displayName: "Capitaine", role: "participant", isHost: true, online: true }] }, count, { bonuses });
  await fixture.route(context);
  await page.reload();
  await expect(page.getByTestId("race-track").locator("[data-runner]")).toHaveCount(count);
  return { page, context };
}

/** Wholly inside the viewport, not just present. */
async function expectOnScreen(page: Page, locator: Locator, name: string) {
  const box = await locator.boundingBox();
  const viewport = page.viewportSize()!;
  expect(box, name).not.toBeNull();
  expect(box!.y, `${name} top`).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height, `${name} bottom`).toBeLessThanOrEqual(viewport.height + 0.5);
  expect(box!.x + box!.width, `${name} right`).toBeLessThanOrEqual(viewport.width + 0.5);
}

for (const [width, height] of [[1440, 900], [1280, 720], [1024, 768]] as const) {
  for (const [locale, theme] of [["fr-CA", "aube"], ["en-US", "abysse"]] as const) {
    test(`text, track and « Ta frappe » usable together at ${width}×${height} ${locale}/${theme}`, async ({ browser }) => {
      test.setTimeout(90_000);
      const { page } = await openRace(browser, { locale, theme, width, height });
      const field = page.getByRole("textbox", { name: locale === "fr-CA" ? "Ta frappe" : "Your typing", exact: true });
      await expect(field).toBeFocused();
      // One effective input control: the text above shows the progress, the pad takes the keys.
      await expect(page.locator("input:not([type=hidden]):not([disabled]), textarea, [contenteditable=true]")).toHaveCount(1);
      const sheet = page.locator("[data-race-sheet]");
      const track = page.getByTestId("race-track");
      const standings = page.getByRole("region", { name: locale === "fr-CA" ? "Classement" : "Standings" });
      const bonuses = page.getByRole("region", { name: "Bonus" + (locale === "fr-CA" ? "" : "es"), exact: true });
      // Drawing order: text, then the row, then the pad.
      const chart = page.locator("section[aria-labelledby=track-heading]");
      const [sheetBox, trackBox, standingsBox, bonusBox, fieldBox, chartBox] = await Promise.all([sheet, track, standings, bonuses, field, chart].map(l => l.boundingBox()));
      await page.screenshot({ animations: "disabled", path: test.info().outputPath(`layout-${locale}-${theme}-${width}x${height}.png`) });
      expect(fieldBox!.y).toBeGreaterThan(trackBox!.y + trackBox!.height);
      expect(trackBox!.y).toBeGreaterThan(sheetBox!.y + sheetBox!.height);
      // One row: standings left, track centre, bonuses right, top-aligned.
      expect(standingsBox!.x + standingsBox!.width).toBeLessThanOrEqual(trackBox!.x + 1);
      expect(trackBox!.x + trackBox!.width).toBeLessThanOrEqual(bonusBox!.x + 1);
      expect(Math.abs(standingsBox!.y - chartBox!.y)).toBeLessThan(2);
      expect(Math.abs(bonusBox!.y - chartBox!.y)).toBeLessThan(2);
      await expectOnScreen(page, sheet, "text");
      await expectOnScreen(page, track, "track");
      await expectOnScreen(page, field, "Ta frappe");
      // Legible, not squeezed: the text keeps its size and several lines; the pad a real target.
      const textSize = await sheet.locator("[role=region]").evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize));
      expect(textSize).toBeGreaterThanOrEqual(18);
      expect(sheetBox!.height).toBeGreaterThanOrEqual(150);
      expect(fieldBox!.height).toBeGreaterThanOrEqual(44);
      expect(trackBox!.height).toBeGreaterThanOrEqual(192); // The chart's 12 rem minimum.
      expect(trackBox!.height).toBeLessThanOrEqual(height * 0.45);
      await expectNoHorizontalScroll(page);

      // Typing while the track, routes and standings refresh: the pad keeps the focus, every key lands.
      const typed = "La mer reste calme. La mer";
      const timer = setInterval(() => fixture?.advance(), 120);
      try {
        for (const key of typed) { await page.keyboard.type(key); await page.waitForTimeout(15); }
      } finally { clearInterval(timer); }
      await expect(field).toBeFocused();
      await expect(sheet.locator(".course-juste")).toHaveCount(typed.length);
      if (width === 1440 && locale === "fr-CA") await expectNoAccessibilityViolation(page);
    });
  }
}
