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
      // What is painted at the marker: a named runner's sail, an unnamed runner's dot.
      const sail = marker.querySelector("[data-sail-cloth]");
      return { marker: sail ? getComputedStyle(sail).fill : getComputedStyle(marker).backgroundColor, route: getComputedStyle(route).stroke, self: marker.hasAttribute("data-self"),
        named: sail !== null, dash: getComputedStyle(route).strokeDasharray,
        pennant: getComputedStyle(document.querySelector(`[data-standing="${id}"] [data-pennant-cloth]`)!).fill };
    }));
    for (const colour of colours) expect(colour.route).toBe(colour.marker);
    // The five runner colours are read on the standings' pennants: on the chart a runner without a
    // name is drawn grey, on one faint dotted route. That grey rule is under study (it departs from
    // the plan's « route, ship and pennant share one colour » for unnamed runners), not settled.
    expect(new Set(colours.map(colour => colour.pennant)).size).toBe(5);
    const unnamed = colours.filter(colour => !colour.named);
    expect(colours).toHaveLength(count);
    expect(unnamed.length).toBeGreaterThanOrEqual(count - 5); expect(unnamed.length).toBeLessThanOrEqual(count - 3);
    expect(new Set(unnamed.map(colour => `${colour.route}/${colour.dash}`)).size).toBe(1);
    const mine = colours.find(colour => colour.self)!;
    expect(mine.named).toBe(true);
    expect(colours.filter(colour => colour.route === mine.route)).toHaveLength(1);
    expect(colours.filter(colour => colour.pennant === mine.pennant)).toHaveLength(1);
    // Three-way match (DA2-2): a runner's sail, route and pennant share one colour and one dash,
    // and the sail and the pennant share the shape of its kind (triangle: human, square: bot).
    const crew = await page.evaluate(() => [...document.querySelectorAll("[data-testid=race-track] [data-runner]")].map(marker => {
      const id = marker.getAttribute("data-runner")!;
      const route = marker.closest("[data-testid=race-track]")!.querySelector(`polyline[data-route="${id}"]`)!;
      const paint = (el: Element | null | undefined, property: "fill" | "stroke" | "strokeDasharray") => el ? getComputedStyle(el)[property] : null;
      const pennant = (el: Element | null) => el && { shape: el.getAttribute("data-pennant"), cloth: paint(el.querySelector("[data-pennant-cloth]"), "fill"),
        wake: paint(el.querySelector("[data-pennant-wake]"), "stroke"), dash: paint(el.querySelector("[data-pennant-wake]"), "strokeDasharray") };
      const ship = marker.querySelector("[data-ship]");
      return { id, kind: marker.getAttribute("data-kind"), self: marker.hasAttribute("data-self"),
        route: { stroke: paint(route, "stroke"), dash: paint(route, "strokeDasharray") },
        ship: ship && { shape: ship.getAttribute("data-sail"), sail: paint(ship.querySelector("[data-sail-cloth]"), "fill"), rings: ship.querySelectorAll("circle").length },
        label: pennant(marker.parentElement!.querySelector("[data-track-label] [data-pennant]")),
        standing: pennant(document.querySelector(`[data-standing="${id}"] [data-pennant]`)) };
    }));
    expect(crew).toHaveLength(count);
    for (const runner of crew) {
      const shape = runner.kind === "bot" ? "square" : "triangle";
      // Every runner has a pennant in the standings: one colour for cloth and line, its kind's shape.
      expect(runner.standing!.shape, runner.id).toBe(shape);
      expect(runner.standing!.wake, runner.id).toBe(runner.standing!.cloth);
      // A named runner sails a ship: sail, route and pennant in one colour and one dash, and the
      // same pennant beside its name on the chart.
      if (runner.ship) {
        expect(runner.standing, runner.id).toEqual({ shape, cloth: runner.route.stroke, wake: runner.route.stroke, dash: runner.route.dash });
        expect(runner.ship.sail, runner.id).toBe(runner.route.stroke);
        expect(runner.ship.shape, runner.id).toBe(shape);
        expect(runner.label, runner.id).toEqual(runner.standing);
      } else expect(runner.label, runner.id).toBeNull();
    }
    const ships = crew.filter(runner => runner.ship);
    expect(ships.length).toBeGreaterThanOrEqual(3); expect(ships.length).toBeLessThanOrEqual(5);
    // Both kinds sail among the named, told apart by the sail alone.
    expect(new Set(ships.map(runner => runner.ship!.shape))).toEqual(new Set(["triangle", "square"]));
    // My ship keeps its two rings; a sole leader's has the single `or` ring (none in a tie, as
    // before; race-track.test.ts pins the ring itself); nobody else has any.
    expect(crew.find(runner => runner.self)!.ship!.rings).toBe(2);
    const otherRings = ships.filter(runner => !runner.self).map(runner => runner.ship!.rings);
    expect(otherRings.every(rings => rings === 0 || rings === 1)).toBe(true);
    expect(otherRings.filter(rings => rings === 1).length).toBeLessThanOrEqual(1);
    // Colour is never alone: the four shared colours each come solid, dashed and dotted.
    expect(new Set(crew.map(runner => `${runner.standing!.cloth}/${runner.standing!.dash}`)).size).toBe(13);
    expect(new Set(crew.map(runner => runner.standing!.dash)).size).toBe(3);
    // The finish is the coast, with its word; the compass sits on the track, under the text sheet.
    await expect(track.locator("[data-coast]:visible")).toHaveCount(1);
    await expect(track.locator("[data-coast]:visible")).toHaveAttribute("data-coast", "horizontal");
    await expect(track.getByText(locale === "fr-CA" ? "Arrivée" : "Finish", { exact: true })).toBeVisible();
    const compass = track.locator("[data-compass]:visible");
    await expect(compass).toHaveCount(1);
    expect((await compass.boundingBox())!.y).toBeGreaterThan((await sheet.boundingBox())!.y + (await sheet.boundingBox())!.height);
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
      // One coast and one compass at every width; on the tablet's horizontal chart the coast is on the right.
      await expect(track.locator("[data-coast]:visible")).toHaveAttribute("data-coast", width === 800 ? "vertical" : "horizontal");
      await expect(track.locator("[data-compass]:visible")).toHaveCount(1);
      // Dots and hulls stay inside the chart, whatever its direction (a named marker is its ship's foot).
      const inside = await track.locator("[data-runner], [data-ship]:visible > path:last-of-type").evaluateAll(marks => { const box = marks[0]!.closest("[data-testid=race-track]")!.getBoundingClientRect();
        return marks.every(mark => { const at = mark.getBoundingClientRect(); return at.left >= box.left && at.right <= box.right && at.top >= box.top && at.bottom <= box.bottom; }); });
      expect(inside).toBe(true);
      await page.screenshot({ animations: "disabled", path: test.info().outputPath(`track-${theme}-${width}.png`), fullPage: true });
      if (width === 360) await expectNoAccessibilityViolation(page);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await marker.evaluate(el => getComputedStyle(el).transitionProperty)).toBe("none");
    // My ship's own slide beside its marker stops with it.
    expect(await marker.evaluate(el => getComputedStyle(el.querySelector("[data-ship]")!).transitionProperty)).toBe("none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    expect(await marker.evaluate(el => getComputedStyle(el.querySelector("[data-ship]")!).transitionDuration)).toContain("0.2s");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.emulateMedia({ forcedColors: "active" });
    // axe-core #3978 mixes authored and forced foregrounds in high-contrast mode.
    // Keep all axe rules above/below in both authored themes; inspect system-color rendering here.
    // The marker no longer carries initials (DA2-2): its ship's sail and hull take the two system colours.
    const systemColors = await marker.evaluate(el => ({
      sail: getComputedStyle(el.querySelector("[data-sail-cloth]")!).fill, hull: getComputedStyle(el.querySelector("[data-ship] > path:last-of-type")!).fill,
      edge: getComputedStyle(el.closest("[data-testid=race-track]")!.querySelector('[data-coast="horizontal"] [data-coast-edge]')!).stroke,
      forced: matchMedia("(forced-colors: active)").matches }));
    expect(systemColors.forced).toBe(true);
    expect(systemColors.sail).not.toBe(systemColors.hull);
    expect(systemColors.edge).toBe(systemColors.sail);
    expect(systemColors.sail).not.toBe("rgba(0, 0, 0, 0)");
    expect(systemColors.sail).not.toBe("none");
    await page.screenshot({ animations: "disabled", path: test.info().outputPath(`track-${theme}-forced-colors.png`), fullPage: true });
    await page.emulateMedia({ forcedColors: "none" });
    await context.unrouteAll({ behavior: "ignoreErrors" }); await fixture.route(context, true); await page.reload();
    await expect(track.locator("[data-runner]")).toHaveCount(count);
    await expect(track.locator('[data-self="true"]')).toHaveCount(0);
    await expect(field).toHaveCount(0);
    await expectNoAccessibilityViolation(page);
  });
}
