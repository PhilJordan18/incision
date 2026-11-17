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
    // The text's sheet and « Ta frappe » hold still while the track and its routes move.
    const sheet = page.locator("[data-race-sheet]");
    const topBefore = await sheet.evaluate(el => el.getBoundingClientRect().top);
    const fieldBefore = await field.boundingBox();
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
    expect(await sheet.evaluate(el => el.getBoundingClientRect().top)).toBe(topBefore);
    expect(await field.boundingBox()).toEqual(fieldBefore);
    await expect(field).toBeFocused();

    // Every runner as text in the standings panel beside the decorative track.
    const standings = page.getByRole("region", { name: locale === "fr-CA" ? "Classement" : "Standings" });
    const items = standings.getByRole("listitem");
    await expect(items).toHaveCount(count);
    await expect(items.filter({ hasText: "Bot" })).toHaveCount(Math.ceil(count / 4));
    const list = standings.getByRole("list");
    // A keyboard stop of its own: it scrolls for a large crew.
    await expect(list).toHaveAttribute("tabindex", "0");
    await list.focus();
    await expect(list).toBeFocused();
    await expectNoAccessibilityViolation(page);
    // Every runner's route, in the marker's own colour; mine in `moi`, with my marker's rings.
    const routes = track.locator("polyline[data-route]");
    await expect(routes).toHaveCount(count);
    const colours = await track.locator("[data-runner]").evaluateAll(markers => markers.map(marker => {
      const id = marker.getAttribute("data-runner")!;
      const route = marker.closest("[data-testid=race-track]")!.querySelector(`polyline[data-route="${id}"]`)!;
      return { marker: getComputedStyle(marker).backgroundColor, route: getComputedStyle(route).stroke, self: marker.hasAttribute("data-self") };
    }));
    for (const colour of colours) expect(colour.route).toBe(colour.marker);
    expect(new Set(colours.map(colour => colour.route)).size).toBe(5);
    const mine = colours.find(colour => colour.self)!;
    expect(colours.filter(colour => colour.route === mine.route)).toHaveLength(1);
    // The same routes after a reload: stable colours, nothing re-dealt.
    const beforeReload = await routes.evaluateAll(lines => lines.map(line => [line.getAttribute("data-route"), getComputedStyle(line).stroke, getComputedStyle(line).strokeDasharray]));
    await page.reload();
    await expect(routes).toHaveCount(count);
    expect(await routes.evaluateAll(lines => lines.map(line => [line.getAttribute("data-route"), getComputedStyle(line).stroke, getComputedStyle(line).strokeDasharray]))).toEqual(beforeReload);
    await expect(field).toBeFocused();
    for (const width of [1440, 1024, 800, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page);
      const size = await track.boundingBox();
      // In the race's row from 1024 px the chart takes the row's height; under it, its own.
      if (width >= 1024) { expect(size!.height).toBeGreaterThanOrEqual(192); expect(size!.height).toBeLessThanOrEqual(352); }
      else expect(size!.height).toBe(width === 800 ? 180 : 560);
      if (width !== 800) {
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
