import { type BrowserContext, expect, test } from "@playwright/test";
import { trackFixture } from "./track-fixture";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
let fixture: Awaited<ReturnType<typeof trackFixture>> | undefined;
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async context => { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }));
  await fixture?.close(); fixture = undefined;
});

for (const [locale, theme] of [["fr-CA", "aube"], ["fr-CA", "abysse"], ["en-US", "abysse"], ["en-US", "aube"]] as const) {
  test(`signature track: 30/50 runners, interpolation, spectators and responsive access ${locale}/${theme}`, async ({ browser }) => {
    test.setTimeout(90_000);
    const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('Capitaine') returning id,session_version");
    const context = await browser.newContext({ locale, viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" }); contexts.push(context);
    const baseURL = test.info().project.use.baseURL!;
    const token = await forgeSessionCookie({ sub: account!.id, sessionVersion: account!.session_version, authTime: Math.floor(Date.now() / 1000) });
    await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }, { name: "theme", value: theme, url: baseURL }]);
    const page = await context.newPage();
    await page.goto("/rooms/new");
    await page.getByRole("button", { name: locale === "fr-CA" ? "Ouvrir la salle" : "Open the room", exact: true }).click();
    await expect(page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
    const code = page.url().split("/").at(-1)!;
    const [member] = await query<{ id: string }>("select m.id from lobby_members m join lobbies l on l.id=m.lobby_id where l.code=$1", [code]);
    const count = locale === "fr-CA" ? 30 : 50;
    fixture = await trackFixture({ code, phase: "waiting", capacity: 30, revision: 1000,
      members: [{ memberId: member!.id, displayName: "Capitaine", role: "participant", isHost: true, online: true }] }, count);
    await fixture.route(context);
    await page.reload();
    const track = page.getByTestId("race-track");
    await expect(track.locator("[data-runner]")).toHaveCount(count);
    await expect(track.locator('[data-self="true"]')).toHaveCount(1);
    const field = page.getByLabel(locale === "fr-CA" ? "Ta frappe" : "Your typing", { exact: true });
    await expect(field).toBeEnabled(); await field.focus();
    const topBefore = await field.evaluate(el => el.getBoundingClientRect().top);
    const marker = track.locator('[data-self="true"]');
    expect(await marker.evaluate(el => getComputedStyle(el).transitionDuration)).toContain("0.2s");
    const motion = marker.evaluate(async el => {
      const positions: number[] = [];
      const intervals: number[] = [];
      const start = performance.now(); let last = start;
      await new Promise<void>(resolve => {
        const frame = (now: number) => {
          positions.push(Math.round(el.getBoundingClientRect().top * 10) / 10); intervals.push(now - last); last = now;
          if (now - start < 2300) requestAnimationFrame(frame); else resolve();
        }; requestAnimationFrame(frame);
      });
      return { distinctPositions: new Set(positions).size, frames: positions.length, maxFrameMs: Math.max(...intervals) };
    });
    const timer = setInterval(() => fixture!.advance(), 250);
    let measured: Awaited<typeof motion>;
    try { measured = await motion; } finally { clearInterval(timer); }
    expect(measured.distinctPositions).toBeGreaterThan(10);
    console.info("[track browser sample]", locale, measured);
    expect(await field.evaluate(el => el.getBoundingClientRect().top)).toBe(topBefore);
    await expect(field).toBeFocused();

    const summary = page.locator("summary").filter({ hasText: locale === "fr-CA" ? "Voir tous les coureurs" : "View all runners" });
    await summary.focus(); await page.keyboard.press("Enter");
    // Use the enclosing details to avoid coupling this contract to the existing heading wording.
    const items = summary.locator("..").locator("li");
    await expect(items).toHaveCount(count);
    await expect(items.filter({ hasText: "Bot" })).toHaveCount(Math.ceil(count / 4));
    await page.keyboard.press("Tab");
    await expect(summary.locator("..").locator("ul")).toBeFocused();
    await expectNoAccessibilityViolation(page);
    await summary.press("Enter");
    for (const width of [1440, 1024, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page);
      const size = await track.boundingBox();
      expect(size!.height).toBe(width === 1024 ? 180 : 560);
      if (width !== 1024) {
        const labels = await track.locator("[data-track-label]").evaluateAll(elements => elements.map(el => {
          const rect = el.getBoundingClientRect(); return { top: rect.top, bottom: rect.bottom };
        }).sort((a, b) => a.top - b.top));
        for (let i = 1; i < labels.length; i++) expect(labels[i]!.top).toBeGreaterThanOrEqual(labels[i - 1]!.bottom);
      }
      await page.screenshot({ animations: "disabled", path: test.info().outputPath(`track-${theme}-${width}.png`), fullPage: true });
      if (width === 360) await expectNoAccessibilityViolation(page);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await marker.evaluate(el => getComputedStyle(el).transitionProperty)).toBe("none");
    await page.emulateMedia({ forcedColors: "active" });
    // axe-core #3978 mixes authored and forced foregrounds in high-contrast mode.
    // Keep all axe rules above/below in both authored themes; inspect system-color rendering here.
    const systemColors = await marker.evaluate(el => ({ background: getComputedStyle(el).backgroundColor,
      initials: getComputedStyle(el.querySelector("span")!).color, forced: matchMedia("(forced-colors: active)").matches }));
    expect(systemColors.forced).toBe(true);
    expect(systemColors.background).not.toBe(systemColors.initials);
    expect(systemColors.background).not.toBe("rgba(0, 0, 0, 0)");
    await page.screenshot({ animations: "disabled", path: test.info().outputPath(`track-${theme}-forced-colors.png`), fullPage: true });
    await page.emulateMedia({ forcedColors: "none" });
    await context.unrouteAll({ behavior: "ignoreErrors" }); await fixture.route(context, true); await page.reload();
    await expect(track.locator("[data-runner]")).toHaveCount(count);
    await expect(track.locator('[data-self="true"]')).toHaveCount(0);
    await expect(field).toHaveCount(0);
    await expectNoAccessibilityViolation(page);
  });
}
