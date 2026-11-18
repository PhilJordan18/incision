import { mkdirSync } from "node:fs";
import path from "node:path";
import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { type ForwardingProxy, startForwardingProxy } from "./forwarding-proxy";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * C1 « Cap », card DA2-6 (docs/da/v2): the decoration beside the room-entry forms. The forms
 * themselves are covered by rooms, public-rooms, quickplay, code-limit, room-invitations,
 * invitation-focus and guest-journey; this spec checks what the decoration must never do
 * (speak, take the focus, move, add a red action, widen the page) and where it sits.
 *
 * DA2_EVIDENCE_DIR=<folder> also writes the captures of docs/evidence/da2-6-room-entry.
 */
const evidenceDir = process.env.DA2_EVIDENCE_DIR;
const LOCALES = ["fr-CA", "en-US"] as const;
type AppLocale = (typeof LOCALES)[number];
const THEMES = [{ scheme: "dark", theme: "abysse" }, { scheme: "light", theme: "aube" }] as const;
const WIDTHS = [1440, 1024, 390, 360] as const;

const contexts: BrowserContext[] = [];
const proxies: ForwardingProxy[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
});

type ContextOptions = { readonly forcedColors?: "active"; readonly javaScriptEnabled?: boolean };

async function visitor(browser: Browser, locale: AppLocale, options: ContextOptions = {}): Promise<Page> {
  const context = await browser.newContext({ locale, reducedMotion: "reduce", colorScheme: "dark", ...options });
  contexts.push(context);
  return context.newPage();
}
async function account(browser: Browser, name: string, locale: AppLocale, options: ContextOptions = {}): Promise<Page> {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id, session_version", [name]);
  if (row === undefined) throw new Error("Missing fixture account");
  const page = await visitor(browser, locale, options);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await page.context().addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return page;
}
const open = /^(Ouvrir la salle|Open the room)$/;
const access = /^(Accès|Access)$/;
const visibility = { public: /^(Publique|Public)$/, code: /^(Sur code|By code)$/ };

async function openRoom(page: Page, kind: keyof typeof visibility = "code"): Promise<string> {
  await page.goto("/rooms/new");
  await page.getByRole("group", { name: access }).getByRole("radio", { name: visibility[kind] }).check();
  await page.getByRole("button", { name: open }).click();
  await expect(page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  return page.url().split("/").at(-1) ?? "";
}
async function setTheme(page: Page, option: (typeof THEMES)[number]): Promise<void> {
  await page.emulateMedia({ colorScheme: option.scheme });
  await expect(page.locator("html")).toHaveAttribute("data-theme", option.theme);
}
async function capture(page: Page, name: string, fullPage = true): Promise<void> {
  const file = evidenceDir === undefined ? test.info().outputPath(`${name}.png`) : path.resolve(evidenceDir, `${name}.png`);
  mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file, fullPage });
}
const scene = (page: Page, name: string): Locator => page.locator(`[data-scene="${name}"]`);

/** A drawing says nothing, takes no click and no focus, and never moves by itself. */
async function expectSilentDrawing(drawing: Locator): Promise<void> {
  await expect(drawing).toHaveAttribute("aria-hidden", "true");
  await expect(drawing).toHaveCSS("pointer-events", "none");
  expect(await drawing.locator("a, button, input, select, textarea, [tabindex]").count()).toBe(0);
  expect(await drawing.evaluate((node) => [node, ...node.querySelectorAll("*")].flatMap((element) => element.getAnimations()).length)).toBe(0);
  expect(await drawing.locator("animate, animateTransform, animateMotion, set").count()).toBe(0);
}
/** Every colour of a drawing comes from a token class: no colour written in the markup. */
async function expectTokenColoursOnly(drawing: Locator): Promise<void> {
  const authored = await drawing.evaluate((node) => [node, ...node.querySelectorAll("*")]
    .flatMap((element) => ["fill", "stroke", "style", "color"].map((name) => element.getAttribute(name)))
    .filter((value): value is string => value !== null && value !== "none"));
  expect(authored).toEqual([]);
  // …nor as a literal inside a class name (`fill-[#…]`, `rgb(…)`).
  const literals = await drawing.evaluate((node) => [node, ...node.querySelectorAll("*")]
    .flatMap((element) => [...element.classList]).filter((name) => /#[0-9a-f]{3,8}\b|rgb|hsl|oklch/i.test(name)));
  expect(literals).toEqual([]);
}
async function redActions(page: Page): Promise<number> { return page.locator("main .bg-action").count(); }
/** Tabs through the whole page; returns how many stops it met. Each one shows a focus ring and sits outside the drawings. */
async function expectKeyboardSkipsDrawings(page: Page): Promise<number> {
  await page.locator("body").focus();
  let stops = 0;
  for (; stops < 60; stops += 1) {
    await page.keyboard.press("Tab");
    const state = await page.evaluate(() => {
      const element = document.activeElement;
      if (element === null || element === document.body) return undefined;
      const style = getComputedStyle(element);
      // The chips and the radios of the page draw the ring on their label.
      const host = element.closest("label") ?? element;
      const ring = [style, getComputedStyle(host)].some((candidate) => candidate.outlineStyle !== "none" && Number.parseFloat(candidate.outlineWidth) >= 2);
      return { inDrawing: element.closest("[data-scene]") !== null, ring, name: element.tagName };
    });
    if (state === undefined) break;
    expect(state.inDrawing, `tab stop ${stops} (${state.name}) is outside the drawings`).toBe(false);
    expect(state.ring, `tab stop ${stops} (${state.name}) shows a focus ring`).toBe(true);
  }
  expect(stops, "the page was walked to its end").toBeLessThan(60);
  return stops;
}
/** Smallest contrast of the chosen solid shapes against the sea of the frame (their fill at full opacity; land behind a shape is not considered). */
async function shapeContrast(drawing: Locator, selector: string): Promise<number> {
  return drawing.evaluate((node, shapes) => {
    const probe = document.createElement("canvas").getContext("2d", { willReadFrequently: true });
    if (probe === null) throw new Error("No canvas");
    const luminance = (colour: string): number => {
      probe.clearRect(0, 0, 1, 1); probe.fillStyle = colour; probe.fillRect(0, 0, 1, 1);
      const [red = 0, green = 0, blue = 0] = [...probe.getImageData(0, 0, 1, 1).data].map((channel) => {
        const value = channel / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    };
    const sea = luminance(getComputedStyle(node).backgroundColor);
    const ratios = [...node.querySelectorAll(shapes)].map((shape) => {
      const mark = luminance(getComputedStyle(shape).fill);
      return (Math.max(mark, sea) + 0.05) / (Math.min(mark, sea) + 0.05);
    });
    if (ratios.length === 0) throw new Error(`No shape matches ${shapes}`);
    return Math.min(...ratios);
  }, selector);
}

for (const locale of LOCALES) {
  const fr = locale === "fr-CA";
  const tag = fr ? "fr" : "en";

  test(`create a room: the chart of the three accesses sits beside an unchanged form (${locale})`, async ({ browser }) => {
    test.slow();
    const page = await account(browser, "Capitaine", locale);
    await page.goto("/rooms/new");
    const chart = scene(page, "access-chart");
    const form = page.locator("main form");
    await expectSilentDrawing(chart);
    await expectTokenColoursOnly(chart);
    // The words drawn in the chart follow the interface language.
    await expect(chart).toContainText(fr ? "01 · Salle publique" : "01 · Public room");
    await expect(chart).toContainText(fr ? "02 · Sur code" : "02 · By code");
    await expect(chart).toContainText(fr ? "03 · Privée" : "03 · Private");
    // No room exists yet: the sign shows no code, not even an example.
    await expect(chart).not.toContainText(/[2-9A-HJKMNP-Z]{6}/);

    // The form keeps every field and its name; the chart adds nothing to what is read out.
    const group = page.getByRole("group", { name: access });
    await expect(group.getByRole("radio")).toHaveCount(3);
    await expect(group.getByRole("radio", { name: visibility.code })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: fr ? "Je participe à la course (sinon : spectateur)" : "I race (otherwise: spectator)" })).toBeVisible();
    await expect(page.getByRole("spinbutton", { name: fr ? "Nombre maximal de participants" : "Maximum participants" })).toHaveValue("30");
    await expect(page.getByRole("button", { name: open })).toBeVisible();
    const spoken = await page.getByRole("main").ariaSnapshot();
    expect(spoken).not.toMatch(/01 ·|02 ·|03 ·/);
    expect(await redActions(page)).toBe(1);

    for (const option of THEMES) {
      await setTheme(page, option);
      // Ships, houses and the lighthouse read against the sea in both themes (non-text marks, 3:1).
      expect(await shapeContrast(chart, ".fill-ecume, .fill-embrun, .fill-moi")).toBeGreaterThanOrEqual(3);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const [formBox, chartBox] = [await form.boundingBox(), await chart.boundingBox()];
        if (formBox === null || chartBox === null) throw new Error("The form and the chart are drawn");
        if (width >= 1024) {
          expect(chartBox.x).toBeGreaterThanOrEqual(formBox.x + formBox.width);
          expect(chartBox.width).toBeGreaterThanOrEqual(300);
        } else {
          expect(chartBox.y).toBeGreaterThanOrEqual(formBox.y + formBox.height);
        }
        await expectNoHorizontalScroll(page);
        await expectNoAccessibilityViolation(page);
        await capture(page, `create-${tag}-${option.theme}-${width}`);
      }
    }
    // A low screen: the chart stays beside the form and the page does not scroll sideways (the form is taller than 640 px, as before).
    await setTheme(page, THEMES[0]);
    await page.setViewportSize({ width: 1280, height: 640 });
    await expectNoHorizontalScroll(page);
    await capture(page, `create-${tag}-abysse-1280x640`, false);
    // 200 % zoom of a 1440 px window: one column, nothing cut, no sideways scroll.
    await page.setViewportSize({ width: 720, height: 450 });
    await expectNoHorizontalScroll(page);
    await expect(page.getByRole("button", { name: open })).toBeVisible();
    await capture(page, `create-${tag}-abysse-zoom200`);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await expectKeyboardSkipsDrawings(page)).toBeGreaterThanOrEqual(6);

    // An invalid capacity is refused as before, with its message, beside the same chart (Aube).
    await setTheme(page, THEMES[1]);
    const capacity = page.getByRole("spinbutton");
    await capacity.fill("31");
    await capacity.evaluate((input: HTMLInputElement) => { input.form?.setAttribute("novalidate", ""); });
    await page.getByRole("button", { name: open }).click();
    await expect(page.getByRole("alert").filter({ hasText: /30/ })).toBeVisible();
    await expect(capacity).toHaveAttribute("aria-invalid", "true");
    await expectSilentDrawing(chart);
    await expectNoAccessibilityViolation(page);
    await capture(page, `create-error-${tag}-aube-1440`);

    // While the room is being opened the button is marked busy and renamed, in Aube too (the answer is held back here).
    await capacity.fill("30");
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => { release = resolve; });
    await page.route("**/rooms/new", async (route) => { if (route.request().method() === "POST") await held; await route.continue(); });
    await page.getByRole("button", { name: open }).click();
    const busy = page.getByRole("button", { name: fr ? "Ouverture…" : "Opening…" });
    await expect(busy).toHaveAttribute("aria-disabled", "true");
    await expectSilentDrawing(chart);
    await capture(page, `create-pending-${tag}-aube-1440`);
    release();
    await expect(page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  });

  test(`public rooms: the fleet fills the two free columns and leaves under 640 px (${locale})`, async ({ browser }) => {
    test.slow();
    const page = await account(browser, "Vigie", locale);
    await page.goto("/rooms");
    const fleet = scene(page, "fleet");
    const card = page.getByRole("region", { name: fr ? "Une course, tout de suite" : "A race, right now" });
    const find = card.getByRole("button", { name: fr ? "Trouver une salle" : "Find a room" });
    await expect(page.getByText(fr ? "La liste se met à jour en direct." : "The list updates live.")).toBeVisible();
    await expect(page.getByText(fr ? "Aucune salle publique ouverte pour l’instant." : "No public room is open right now.")).toBeVisible();
    await expectSilentDrawing(fleet);
    await expectTokenColoursOnly(fleet);
    expect(await redActions(page)).toBe(1);
    await expect(find).toHaveClass(/bg-action/);

    const layouts = async (state: string) => {
      for (const option of THEMES) {
        await setTheme(page, option);
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 });
          if (width < 640) {
            await expect(fleet).toBeHidden();
          } else {
            await expect(fleet).toBeVisible();
            const [cardBox, fleetBox] = [await card.boundingBox(), await fleet.boundingBox()];
            if (cardBox === null || fleetBox === null) throw new Error("The card and the fleet are drawn");
            // Beside the card, as tall as it, on the two other columns of the design's grid.
            expect(fleetBox.x).toBeGreaterThanOrEqual(cardBox.x + cardBox.width);
            expect(Math.abs(fleetBox.height - cardBox.height)).toBeLessThanOrEqual(1);
            expect(fleetBox.width).toBeGreaterThan(cardBox.width * 1.9);
            // The whole drawing fits its frame: the first ship and the lighthouse are never cropped.
            for (const part of await fleet.locator("svg > g:not(:first-child)").all()) {
              const drawn = await part.boundingBox();
              if (drawn === null) throw new Error("Every ship and the island are drawn");
              expect(drawn.x).toBeGreaterThanOrEqual(fleetBox.x);
              expect(drawn.x + drawn.width).toBeLessThanOrEqual(fleetBox.x + fleetBox.width);
              expect(drawn.y).toBeGreaterThanOrEqual(fleetBox.y);
              expect(drawn.y + drawn.height).toBeLessThanOrEqual(fleetBox.y + fleetBox.height);
            }
          }
          await expectNoHorizontalScroll(page);
          await expectNoAccessibilityViolation(page);
          await capture(page, `public-rooms-${state}-${tag}-${option.theme}-${width}`);
        }
      }
      await setTheme(page, THEMES[0]);
      await page.setViewportSize({ width: 1440, height: 900 });
    };
    await layouts("empty");
    expect(await shapeContrast(fleet, ".fill-ecume, .fill-moi")).toBeGreaterThanOrEqual(3);

    // Between 640 and 1023 px the grid has one column: the fleet goes under the card, full width.
    await page.setViewportSize({ width: 768, height: 900 });
    const [cardBox, fleetBox] = [await card.boundingBox(), await fleet.boundingBox()];
    expect(fleetBox?.y ?? 0).toBeGreaterThanOrEqual((cardBox?.y ?? 0) + (cardBox?.height ?? 0));
    await expectNoHorizontalScroll(page);
    await capture(page, `public-rooms-empty-${tag}-abysse-768`);
    await page.setViewportSize({ width: 1280, height: 640 });
    await expect(find).toBeInViewport({ ratio: 1 });
    await capture(page, `public-rooms-empty-${tag}-abysse-1280x640`, false);
    await page.setViewportSize({ width: 720, height: 450 });
    await expectNoHorizontalScroll(page);
    await capture(page, `public-rooms-empty-${tag}-abysse-zoom200`);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await expectKeyboardSkipsDrawings(page)).toBeGreaterThanOrEqual(6);

    // No room has a place: the card grows with its message and second action, the fleet follows; still one red action.
    await find.click();
    await expect(card.getByRole("status")).toBeFocused();
    await expect(card.getByRole("button", { name: fr ? "Créer une salle publique" : "Create a public room" })).toBeVisible();
    expect(await redActions(page)).toBe(1);
    const grown = await card.boundingBox();
    expect(Math.abs(((await fleet.boundingBox())?.height ?? 0) - (grown?.height ?? 0))).toBeLessThanOrEqual(1);
    await setTheme(page, THEMES[1]);
    await expectNoAccessibilityViolation(page);
    await capture(page, `public-rooms-no-room-${tag}-aube-1440`);
    await setTheme(page, THEMES[0]);

    // With rooms in the list: the fleet is a drawing, it does not count or name them.
    const host = await account(browser, "Hôte public", "fr-CA");
    const code = await openRoom(host, "public");
    await expect(page.getByRole("link", { name: fr ? `Rejoindre la salle ${code}` : `Join room ${code}` })).toBeVisible();
    await expect(fleet).not.toContainText(code);
    await layouts("listed");
  });

  test(`join by code: the small chart carries the room's real code and stays silent (${locale})`, async ({ browser }) => {
    test.slow();
    const host = await account(browser, "Hôte", "fr-CA");
    const code = await openRoom(host);
    const page = await account(browser, "Mousse", locale);
    await page.goto(`/rooms/${code}`);
    const chart = scene(page, "join-chart");
    const join = page.getByRole("button", { name: fr ? "Rejoindre la salle" : "Join the room" });
    await expectSilentDrawing(chart);
    await expectTokenColoursOnly(chart);
    await expect(chart.locator("text")).toHaveText(code);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(fr ? /Rejoindre\s+l’équipage/ : /Join the\s+crew/);
    await expect(page.getByRole("checkbox", { name: fr ? "Je participe à la course (sinon : spectateur)" : "I race (otherwise: spectator)" })).toBeVisible();
    await expect(join).toBeVisible();
    expect(await redActions(page)).toBe(1);
    // Read out once in the label block and once in the sentence: the sign in the chart is not a third time.
    expect((await page.getByRole("main").ariaSnapshot()).split(code).length - 1).toBe(2);

    const panel = page.locator("main section").filter({ has: join });
    for (const option of THEMES) {
      await setTheme(page, option);
      expect(await shapeContrast(chart, ".fill-ecume, .fill-moi")).toBeGreaterThanOrEqual(3);
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const [panelBox, chartBox] = [await panel.boundingBox(), await chart.boundingBox()];
        if (panelBox === null || chartBox === null) throw new Error("The panel and the chart are drawn");
        if (width >= 1024) expect(chartBox.x).toBeGreaterThanOrEqual(panelBox.x + panelBox.width);
        else expect(chartBox.y).toBeGreaterThanOrEqual(panelBox.y + panelBox.height);
        await expectNoHorizontalScroll(page);
        await expectNoAccessibilityViolation(page);
        await capture(page, `join-${tag}-${option.theme}-${width}`);
      }
    }
    await setTheme(page, THEMES[0]);
    await page.setViewportSize({ width: 1280, height: 640 });
    await expect(join).toBeInViewport({ ratio: 1 });
    await capture(page, `join-${tag}-abysse-1280x640`, false);
    await page.setViewportSize({ width: 720, height: 450 });
    await expectNoHorizontalScroll(page);
    await capture(page, `join-${tag}-abysse-zoom200`);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await expectKeyboardSkipsDrawings(page)).toBeGreaterThanOrEqual(6);

    // The form still joins: the visitor lands in the waiting room.
    await join.click();
    await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  });

  test(`room states, refusals and errors: wave marks in the corner, nothing else changes (${locale})`, async ({ browser }) => {
    test.slow();
    const host = await account(browser, "Hôte", "fr-CA");
    const code = await openRoom(host);
    const page = await account(browser, "Passagère", locale);
    const waves = scene(page, "corner-waves");
    const panel = page.locator("main section").filter({ has: waves });
    const sign = panel.locator("p").first().locator("span[aria-hidden=true]");

    /** One state panel: its tone (border and sign), its heading and actions, then the marks. */
    const expectState = async (name: string, expected: { border: string; sign: string; heading: RegExp; actions: readonly RegExp[]; red?: number }) => {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(expected.heading);
      await expect(waves).toHaveCount(1);
      await expectSilentDrawing(waves);
      await expectTokenColoursOnly(waves);
      // The colour that is really drawn, not the class list (the card style carries a border class of its own).
      expect(await panel.evaluate((section, token) => {
        const probe = document.createElement("i"); probe.style.color = `var(--color-${token})`; section.append(probe);
        const wanted = getComputedStyle(probe).color; probe.remove();
        return getComputedStyle(section).borderTopColor === wanted;
      }, expected.border), `the panel's border is ${expected.border}`).toBe(true);
      await expect(sign).toHaveText(expected.sign);
      const actions = panel.getByRole("link").or(panel.getByRole("button"));
      await expect(actions).toHaveText([...expected.actions]);
      expect(await redActions(page)).toBe(expected.red ?? 0);
      for (const option of THEMES) {
        await setTheme(page, option);
        for (const width of [1440, 390, 360] as const) {
          await page.setViewportSize({ width, height: 900 });
          // The marks stay in the top right corner, inside the panel.
          const [panelBox, wavesBox] = [await panel.boundingBox(), await waves.boundingBox()];
          if (panelBox === null || wavesBox === null) throw new Error("The panel and its marks are drawn");
          expect(Math.abs(wavesBox.x + wavesBox.width - (panelBox.x + panelBox.width))).toBeLessThanOrEqual(2);
          expect(Math.abs(wavesBox.y - panelBox.y)).toBeLessThanOrEqual(2);
          // They may pass behind the title, never behind the label or the sentences.
          expect(await panel.evaluate((section) => {
            const texts = [...section.querySelectorAll(":scope > p, :scope > div p")].map((node) => { const range = document.createRange(); range.selectNodeContents(node); return [...range.getClientRects()]; }).flat();
            const marks = [...section.querySelectorAll("[data-scene] path")].map((mark) => mark.getBoundingClientRect()).filter((box) => box.width > 0);
            return marks.filter((mark) => texts.some((text) => mark.left < text.right && text.left < mark.right && mark.top < text.bottom && text.top < mark.bottom)).length;
          })).toBe(0);
          await expectNoHorizontalScroll(page);
          await expectNoAccessibilityViolation(page);
          if (width !== 360) await capture(page, `state-${name}-${tag}-${option.theme}-${width}`);
        }
      }
      await setTheme(page, THEMES[0]);
      await page.setViewportSize({ width: 1440, height: 900 });
      expect(await expectKeyboardSkipsDrawings(page)).toBeGreaterThanOrEqual(expected.actions.length);
    };
    const create = fr ? /^Créer une salle$/ : /^Create a room$/;
    const home = fr ? /^Revenir à l’accueil$/ : /^Back to the home page$/;

    // 1. Unknown code: neutral, with the code form and its red action. Through a network of its own:
    // the loopback address and its budget of failed codes are shared by every spec (SALLE-10).
    const proxy = await startForwardingProxy(test.info().project.use.baseURL ?? "", fr ? "203.0.113.61" : "203.0.113.62");
    proxies.push(proxy);
    await page.goto(`${proxy.url}/rooms/ZZZZZ2`);
    await expectState("unknown", { border: "houle", sign: "· ", heading: fr ? /^Code introuvable$/ : /^Code not found$/, actions: [fr ? /^Rejoindre la salle$/ : /^Join the room$/, create], red: 1 });
    await expect(page.getByRole("textbox", { name: fr ? "Code de salle" : "Room code" })).toBeVisible();

    // 2. Already in a room, as a member who may leave it: on the room page and on « Créer une salle ».
    const member = await account(browser, "Équipière", locale);
    await member.goto(`/rooms/${code}`);
    await member.getByRole("button", { name: fr ? "Rejoindre la salle" : "Join the room" }).click();
    await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
    const other = await openRoom(await account(browser, "Autre hôte", "fr-CA"));
    const memberWaves = scene(member, "corner-waves");
    await member.goto(`/rooms/${other}`);
    await expect(member.getByRole("heading", { level: 1 })).toHaveText(fr ? /^Déjà en salle$/ : /^Already in a room$/);
    await expect(memberWaves).toHaveCount(1);
    await expect(member.locator("main section").filter({ has: memberWaves }).locator("p").first()).toHaveText(/^⚠ /);
    await expectNoAccessibilityViolation(member);
    await member.screenshot({ path: evidenceDir === undefined ? test.info().outputPath("in-another.png") : path.resolve(evidenceDir, `state-in-another-room-${tag}-abysse-1440.png`), fullPage: true });
    await member.goto("/rooms/new");
    await expect(member.getByRole("heading", { level: 1 })).toHaveText(fr ? /^Déjà en salle$/ : /^Already in a room$/);
    await expect(memberWaves).toHaveCount(1);
    await expect(scene(member, "access-chart")).toHaveCount(0);
    await setTheme(member, THEMES[1]);
    await expectNoAccessibilityViolation(member);
    await member.screenshot({ path: evidenceDir === undefined ? test.info().outputPath("already.png") : path.resolve(evidenceDir, `state-already-in-room-${tag}-aube-1440.png`), fullPage: true });

    // 3. A race is running (a fixture: nothing runs it), then the room is closed.
    await query(
      `with room as (select id from lobbies where code = $1),
       race as (
         insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, owner_id, lease_expires_at)
         select id, 1, 'racing', 1, 'Texte de test.', '{}'::jsonb, now(), now(), gen_random_uuid(), now() + interval '30 seconds' from room
         returning id, lobby_id
       )
       update lobbies set phase = 'racing', current_race_id = race.id from race where lobbies.id = race.lobby_id`,
      [code],
    );
    await page.goto(`/rooms/${code}`);
    await expectState("racing", { border: "or", sign: "⚠ ", heading: fr ? /^Course\s+lancée$/ : /^Race\s+running$/, actions: [create, home] });
    await query("update lobbies set phase = 'closed', closed_at = now() where code = $1", [code]);
    await page.goto(`/rooms/${code}`);
    await expectState("closed", { border: "houle", sign: "· ", heading: fr ? /^Salle\s+fermée$/ : /^Room\s+closed$/, actions: [create, home] });

    // 4. Page not found.
    await page.goto("/cap-perdu");
    await expectState("not-found", { border: "houle", sign: "· ", heading: fr ? /^Cap\s+perdu$/ : /^Off\s+course$/, actions: [home] });

    // 5. Too many wrong codes from one network: the same panel whatever the code.
    // The unknown code above already spent one of the ten failed codes this network may try in a minute.
    for (let index = 0; index < 9; index += 1) await page.request.get(`${proxy.url}/rooms/ZZZZ${"23456789AB"[index]}9`);
    await page.goto(`${proxy.url}/rooms/ZZZZZ3`);
    await expectState("throttled", { border: "or", sign: "⚠ ", heading: fr ? /^Trop d’essais$/ : /^Too many tries$/, actions: [fr ? /^Réessayer$/ : /^Try again$/, home] });
  });
}

for (const option of THEMES) {
  test(`forced colours with ${option.theme}: every drawing takes system colours and the forms stay readable`, async ({ browser }) => {
    test.slow();
    const host = await account(browser, "Hôte", "fr-CA");
    const code = await openRoom(host, "public");
    const page = await account(browser, "Contraste", "fr-CA", { forcedColors: "active" });
    await page.setViewportSize({ width: 1440, height: 1100 });
    /** Fills and strokes of a drawing that are not a system colour (the hidden chart grid aside). */
    const authoredColours = async (drawing: Locator) => drawing.evaluate((node) => {
      const system = new Set(["Canvas", "CanvasText", "Highlight"].map((name) => { const probe = document.createElement("i"); probe.style.color = name; node.append(probe); const value = getComputedStyle(probe).color; probe.remove(); return value; }));
      const shapes = [...node.querySelectorAll("path, rect, circle, text")].filter((shape) => shape.closest(".forced-colors\\:hidden") === null);
      if (shapes.length === 0) throw new Error("The drawing has shapes");
      return shapes.flatMap((shape) => [getComputedStyle(shape).fill, getComputedStyle(shape).stroke]).filter((value) => value !== "none" && !system.has(value));
    });
    for (const [url, name, shot] of [["/rooms/new", "access-chart", "create"], ["/rooms", "fleet", "public-rooms"], [`/rooms/${code}`, "join-chart", "join"], ["/cap-perdu", "corner-waves", "state-not-found"]] as const) {
      await page.goto(url);
      // The theme a person chose (here through the system scheme) must not bring token colours back.
      await setTheme(page, option);
      await expect(scene(page, name)).toBeVisible();
      expect(await authoredColours(scene(page, name)), `${name} uses system colours only`).toEqual([]);
      // A viewport capture: headless Chromium drops the forced rendering in a full-page one.
      await capture(page, `${shot}-fr-forced-colours-${option.theme}-1440`, false);
    }
  });
}

test("without JavaScript the pages and their drawings are served complete", async ({ browser }) => {
  const page = await account(browser, "Sans script", "fr-CA", { javaScriptEnabled: false });
  await page.goto("/rooms/new");
  await expect(scene(page, "access-chart")).toBeVisible();
  await expect(page.getByRole("button", { name: open })).toBeVisible();
  await page.goto("/rooms");
  await expect(scene(page, "fleet")).toBeVisible();
  await page.goto("/cap-perdu");
  await expect(scene(page, "corner-waves")).toHaveCount(1);
});
