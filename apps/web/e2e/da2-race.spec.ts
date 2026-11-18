import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { trackFixture } from "./track-fixture";
import { expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * DA2-2 (art direction C1 « Cap »): the race with ships, pennants, the red coast and the compass,
 * checked on the running app at the sizes, themes and languages the plan lists. With
 * `DA2_EVIDENCE_DIR` set, each case also writes its capture there (docs/evidence/da2-2-race-ships).
 * Rendering fixture only (track-fixture.ts): no rule, score or broadcast is exercised here.
 */
const contexts: BrowserContext[] = [];
let fixture: Awaited<ReturnType<typeof trackFixture>> | undefined;
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async context => { await context.unrouteAll({ behavior: "ignoreErrors" }); await context.close(); }));
  await fixture?.close(); fixture = undefined;
});

type Case = { readonly locale: "fr-CA" | "en-US"; readonly theme: "aube" | "abysse"; readonly width: number; readonly height: number;
  readonly count: 30 | 50; readonly forcedColors?: boolean; readonly scale?: number };

async function openRace(browser: Browser, { locale, theme, width, height, count, forcedColors = false, scale = 1 }: Case): Promise<Page> {
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('Capitaine') returning id,session_version");
  const context = await browser.newContext({ locale, viewport: { width, height }, deviceScaleFactor: scale, reducedMotion: "no-preference",
    forcedColors: forcedColors ? "active" : "none" }); contexts.push(context);
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
    members: [{ memberId: member!.id, displayName: "Capitaine", role: "participant", isHost: true, online: true }] }, count, { bonuses: true });
  await fixture.route(context);
  await page.reload();
  await expect(page.getByTestId("race-track").locator("[data-runner]")).toHaveCount(count);
  // A few broadcasts, so the crew is spread along the chart as in the middle of a race.
  for (let step = 0; step < 4; step++) fixture.advance();
  await expect(page.getByTestId("race-track").locator('[data-self="true"]')).toHaveAttribute("data-position", "28");
  return page;
}

/** The window as the player sees it; the whole race on a phone or at 200 %, where the chart is under the fold. */
async function capture(page: Page, name: string, whole: boolean): Promise<void> {
  const directory = process.env.DA2_EVIDENCE_DIR;
  const file = directory ? path.join(directory, `${name}.jpg`) : test.info().outputPath(`${name}.jpg`);
  if (directory) mkdirSync(directory, { recursive: true });
  const options = { animations: "disabled", path: file, type: "jpeg", quality: 85 } as const;
  if (whole) await page.locator("[data-race-view]").screenshot(options); else await page.screenshot(options);
}

/** Boxes of what must not collide on the chart: the visible names, the compass, the ships. */
async function chartBoxes(page: Page) {
  return page.getByTestId("race-track").evaluate(track => {
    const visible = (el: Element) => { const box = el.getBoundingClientRect(); return box.width > 0 && box.height > 0; };
    const box = (el: Element) => { const { left, top, right, bottom } = el.getBoundingClientRect(); return { left, top, right, bottom }; };
    return { track: box(track), labels: [...track.querySelectorAll("[data-track-label]")].filter(visible).map(box),
      compass: [...track.querySelectorAll("[data-compass]")].filter(visible).map(box),
      ships: [...track.querySelectorAll("[data-ship]")].filter(visible).map(el => box(el.querySelector("path:last-of-type")!)),
      markers: [...track.querySelectorAll("[data-runner]")].map(box) };
  });
}
type Box = { left: number; top: number; right: number; bottom: number };
// Half a pixel of tolerance: on the shortest chart (12 rem) two 31.2 px names sit 30.9 px apart, as
// they did before DA2-2 (LABEL_GAP in track-layout.ts); no glyph touches another.
const overlap = (a: Box, b: Box) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

const cases: readonly Case[] = [
  { locale: "fr-CA", theme: "abysse", width: 1440, height: 900, count: 30 },
  { locale: "fr-CA", theme: "aube", width: 1440, height: 900, count: 30 },
  { locale: "en-US", theme: "abysse", width: 1440, height: 900, count: 50 },
  { locale: "en-US", theme: "aube", width: 1440, height: 900, count: 50 },
  { locale: "fr-CA", theme: "abysse", width: 1280, height: 640, count: 30 },
  { locale: "fr-CA", theme: "aube", width: 1280, height: 640, count: 50 },
  { locale: "fr-CA", theme: "abysse", width: 1024, height: 768, count: 30 },
  { locale: "en-US", theme: "aube", width: 1024, height: 768, count: 50 },
  // The tablet's horizontal chart (640 to 1023 px), never drawn in the mock-ups.
  { locale: "fr-CA", theme: "abysse", width: 800, height: 1000, count: 30 },
  { locale: "en-US", theme: "aube", width: 800, height: 1000, count: 50 },
  { locale: "fr-CA", theme: "abysse", width: 390, height: 844, count: 30 },
  { locale: "fr-CA", theme: "aube", width: 390, height: 844, count: 50 },
  { locale: "en-US", theme: "abysse", width: 360, height: 740, count: 50 },
  { locale: "fr-CA", theme: "abysse", width: 1440, height: 900, count: 30, forcedColors: true },
  { locale: "fr-CA", theme: "aube", width: 800, height: 1000, count: 30, forcedColors: true },
  // 200 % zoom of a 1536 × 960 window: 768 × 480 CSS px, the narrowest that still types.
  { locale: "fr-CA", theme: "abysse", width: 768, height: 480, count: 30, scale: 2 },
  { locale: "en-US", theme: "aube", width: 768, height: 480, count: 50, scale: 2 },
];

for (const item of cases) {
  const { locale, theme, width, height, count, forcedColors, scale } = item;
  const name = `course-${width}x${height}-${theme}-${locale.slice(0, 2)}-${count}${forcedColors ? "-forced-colours" : ""}${scale === 2 ? "-zoom-200" : ""}`;
  test(`race ships ${name}`, async ({ browser }) => {
    test.setTimeout(60_000);
    const page = await openRace(browser, item);
    const track = page.getByTestId("race-track");
    await expectNoHorizontalScroll(page);
    // One coast, one compass, the finish word; the chart turns on its side between 640 and 1023 px.
    const horizontal = width >= 640 && width < 1024;
    await expect(track.locator("[data-coast]:visible")).toHaveAttribute("data-coast", horizontal ? "vertical" : "horizontal");
    await expect(track.locator("[data-compass]:visible")).toHaveCount(1);
    await expect(track.getByText(locale === "fr-CA" ? "Arrivée" : "Finish", { exact: true })).toBeVisible();
    const boxes = await chartBoxes(page);
    // Every marker and hull inside the chart; no name over another name, the compass or a hull.
    for (const marker of [...boxes.markers, ...boxes.ships]) {
      expect(marker.left).toBeGreaterThanOrEqual(boxes.track.left); expect(marker.right).toBeLessThanOrEqual(boxes.track.right);
      expect(marker.top).toBeGreaterThanOrEqual(boxes.track.top); expect(marker.bottom).toBeLessThanOrEqual(boxes.track.bottom);
    }
    // Five named runners sail on the vertical chart; on the tablet's, only the two it names (me and a sole leader).
    if (horizontal) expect(boxes.ships.length).toBe(boxes.labels.length); else expect(boxes.ships.length).toBeGreaterThanOrEqual(3);
    // Along the top, the coastline never crosses the finish word or the others' count.
    if (!horizontal) expect(await track.evaluate(el => { const edge = el.querySelector("[data-coast]:not([data-coast=vertical]) [data-coast-edge]")!.getBoundingClientRect();
      return [...el.querySelectorAll(":scope > span")].filter(word => getComputedStyle(word).top === "6px").every(word => word.getBoundingClientRect().bottom <= edge.top + 1); })).toBe(true);
    for (const [i, label] of boxes.labels.entries()) {
      for (const other of boxes.labels.slice(i + 1)) expect(overlap(label, other), "two names overlap").toBe(false);
      for (const compass of boxes.compass) expect(overlap(label, compass), "a name over the compass").toBe(false);
      for (const hull of boxes.ships) expect(overlap(label, hull), "a name over a hull").toBe(false);
    }
    // The compass is on the chart, clear of the text sheet above it.
    if (width >= 768) {
      const sheet = (await page.locator("[data-race-sheet]").boundingBox())!;
      expect(boxes.compass[0]!.top).toBeGreaterThan(sheet.y + sheet.height);
    } else await expect(page.locator("[data-race-sheet]")).toHaveCount(0);
    // Typing keeps the focus on a keyboard-sized screen; under 768 px the advice replaces it, as before.
    const field = page.getByRole("textbox", { name: locale === "fr-CA" ? "Ta frappe" : "Your typing", exact: true });
    if (width >= 768) {
      await expect(field).toBeFocused();
      const before = await field.boundingBox();
      fixture!.advance();
      await expect(track.locator('[data-self="true"]')).toHaveAttribute("data-position", "30");
      expect(await field.boundingBox()).toEqual(before);
      await expect(field).toBeFocused();
      // Keyboard only: the chart adds no tab stop (it is decorative and takes no pointer).
      expect(await track.evaluate(el => el.querySelectorAll("a, button, [tabindex]").length)).toBe(0);
      expect(await track.evaluate(el => getComputedStyle(el.querySelector("[data-ship]")!).pointerEvents)).toBe("none");
    }
    await capture(page, name, width < 640 || scale === 2);
  });
}

/** Non-text marks ≥ 3:1 and the chart's words ≥ 4.5:1 against what is behind them, in both themes. */
for (const theme of ["abysse", "aube"] as const) {
  test(`race ships contrast ${theme}`, async ({ browser }) => {
    const page = await openRace(browser, { locale: "fr-CA", theme, width: 1440, height: 900, count: 30 });
    const ratios = await page.evaluate(() => {
      const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
      const context = canvas.getContext("2d", { willReadFrequently: true })!;
      // Resolves any CSS colour (tokens, color-mix) to opaque sRGB, painted over `under`.
      const rgb = (colour: string, under = "#fff") => { context.fillStyle = under; context.fillRect(0, 0, 1, 1); context.fillStyle = colour; context.fillRect(0, 0, 1, 1);
        return [...context.getImageData(0, 0, 1, 1).data].slice(0, 3); };
      const luminance = (channels: number[]) => channels.map(value => { const c = value / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
        .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i]!, 0);
      const ratio = (a: string, b: string) => { const [light, dark] = [luminance(rgb(a, b)), luminance(rgb(b))].sort((x, y) => y - x); return Math.round((light! + 0.05) / (dark! + 0.05) * 100) / 100; };
      const style = (selector: string, root: ParentNode = document) => getComputedStyle(root.querySelector(selector)!);
      const track = document.querySelector("[data-testid=race-track]")!;
      const sea = getComputedStyle(track).backgroundColor;
      const land = style("[data-coast=horizontal] [data-coast-land]", track).fill;
      const list = getComputedStyle(document.querySelector("[data-standing]")!.closest("section")!).backgroundColor;
      const marks: Record<string, number> = {};
      for (const pennant of document.querySelectorAll("[data-standing] [data-pennant]")) {
        marks[`pennant ${pennant.getAttribute("data-colour")} / panel`] = ratio(style("[data-pennant-cloth]", pennant).fill, list);
      }
      for (const route of track.querySelectorAll<SVGElement>("polyline[data-route]")) {
        const colour = track.querySelector(`[data-runner="${route.dataset.route}"]`)!.getAttribute("data-route-colour");
        marks[`route ${colour} / sea`] = ratio(getComputedStyle(route).stroke, sea);
      }
      for (const ship of track.querySelectorAll("[data-ship]")) marks[`sail ${ship.getAttribute("data-colour")} / sea`] = ratio(style("[data-sail-cloth]", ship).fill, sea);
      marks["hull / sea"] = ratio(style("[data-ship] > path:last-of-type", track).fill, sea);
      marks["coast edge / sea"] = ratio(style("[data-coast-edge]", track).stroke, sea);
      marks["compass line / sea"] = ratio(style("[data-compass] circle", track).stroke, sea);
      const words: Record<string, number> = {};
      const finish = [...track.querySelectorAll("span")].find(el => el.textContent === "Arrivée")!;
      words["finish word / land"] = ratio(getComputedStyle(finish).color, land);
      words["others count / land"] = ratio(getComputedStyle(finish.parentElement!.querySelector(":scope > span:last-of-type")!).color, land);
      words["name / sea"] = ratio(getComputedStyle(track.querySelector("[data-track-label]")!).color, sea);
      return { marks, words, land: rgb(land).join(","), sea: rgb(sea).join(",") };
    });
    console.info("[da2-race contrast]", theme, JSON.stringify(ratios));
    for (const [mark, value] of Object.entries(ratios.marks)) expect(value, mark).toBeGreaterThanOrEqual(3);
    for (const [word, value] of Object.entries(ratios.words)) expect(value, word).toBeGreaterThanOrEqual(4.5);
    // The coast reads as land: it is not the sea's colour, in Aube included.
    expect(ratios.land).not.toBe(ratios.sea);
  });
}
