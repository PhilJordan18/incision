import { writeFile } from "node:fs/promises";
import { type Browser, type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

// Waiting room, second layout (DA2-5, D-15): order, counters, host and non-host views, the full
// room, and the captures of the delivery. Occupancy is a database fixture; every change under
// test goes through the page.
const EVIDENCE = process.env.DA2_EVIDENCE === "1" ? "../../docs/evidence/da2-5-waiting-room" : undefined;
const LIVE = /^\[\.(En direct|Live)\]$/;
type Theme = "abysse" | "aube";
type Occupancy = { readonly participants?: number; readonly spectators?: number; readonly bots?: number; readonly capacity?: number };

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id = null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function account(browser: Browser, name: string, options: { locale?: string; theme?: Theme; forcedColors?: boolean } = {}): Promise<Page> {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ($1) returning id, session_version", [name]);
  if (!row) throw new Error("fixture account");
  const context = await browser.newContext({
    locale: options.locale ?? "fr-CA", reducedMotion: "reduce", viewport: { width: 1440, height: 900 },
    forcedColors: options.forcedColors === true ? "active" : "none",
  });
  contexts.push(context);
  const url = test.info().project.use.baseURL ?? "";
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url }, { name: "theme", value: options.theme ?? "abysse", url }]);
  return context.newPage();
}

async function openRoom(host: Page): Promise<string> {
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(host.getByText(LIVE)).toBeVisible();
  return host.url().split("/").at(-1) ?? "";
}

/** Fills the room in the database (fixture only), then reloads the host's page on it. */
async function occupy(host: Page, code: string, { participants = 0, spectators = 0, bots = 0, capacity }: Occupancy): Promise<void> {
  const [room] = await query<{ id: string }>("select id from lobbies where code = $1", [code]);
  if (!room) throw new Error("fixture room");
  if (capacity !== undefined) await query("update lobbies set capacity = $2 where id = $1", [room.id, capacity]);
  for (const [role, count] of [["participant", participants], ["spectator", spectators]] as const) {
    if (count === 0) continue;
    await query(`with people as (
      insert into accounts (display_name) select initcap($2::text) || ' ' || n from generate_series(1, $3::int) n returning id, display_name
    ) insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical)
      select $1, id, $2::member_role, display_name, lower(display_name) from people`, [room.id, role, count]);
  }
  const levels = ["intermediate", "noob", "expert", "beginner", "beginner", "intermediate", "impossible", "noob", "expert", "intermediate"];
  for (let index = 0; index < bots; index++) await query("insert into lobby_bots(lobby_id, level) values($1, $2)", [room.id, levels[index % levels.length]]);
  await host.reload();
  await expect(host.getByText(LIVE)).toBeVisible();
}

async function join(member: Page, code: string, spectator = false): Promise<void> {
  await member.goto(`/rooms/${code}`);
  if (spectator) await member.getByRole("checkbox").uncheck();
  await member.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
  await expect(member.getByText(LIVE)).toBeVisible();
}

const region = (page: Page, name: RegExp) => page.getByRole("region", { name });
const REGIONS = [
  /^(Code de la salle|Room code)$/, /^(Réglages de la course|Race settings)$/, /^(Visibilité de la salle|Room visibility)$/,
  /^(Capacité de la salle|Room capacity)$/, /^Invitations$/, /^(Équipage|Crew)$/, /^Bots$/, /^(Modération de la salle|Room moderation)$/,
];

async function top(locator: Locator): Promise<number> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("not rendered");
  return box.y;
}

async function capture(page: Page, name: string, fullPage = true): Promise<void> {
  await page.screenshot({ path: EVIDENCE === undefined ? test.info().outputPath(`${name}.jpg`) : `${EVIDENCE}/${name}.jpg`, type: "jpeg", quality: 72, fullPage });
}

/** The buttons of `main` painted as the red primary (the `action` token as their background). */
async function redActions(page: Page): Promise<string[]> {
  return page.getByRole("main").locator("button, a").evaluateAll((elements) => {
    const probe = document.createElement("span");
    probe.className = "bg-action";
    document.body.append(probe);
    const action = getComputedStyle(probe).backgroundColor;
    probe.remove();
    return elements.filter((element) => getComputedStyle(element).backgroundColor === action).map((element) => element.textContent ?? "");
  });
}

test("the host reads the room in the approved order at every width, with one red action", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const code = await openRoom(host);
  await occupy(host, code, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
  // DOM order: the regions follow each other as the page lists them.
  const names = await host.getByRole("main").getByRole("region").evaluateAll((regions) => regions.map((element) => {
    const label = element.getAttribute("aria-labelledby");
    return (label === null ? "" : document.getElementById(label)?.textContent) ?? "";
  }));
  expect(names).toEqual(["Code de la salle", "Réglages de la course", "Visibilité de la salle", "Capacité de la salle", "Invitations", "Équipage", "Bots", "Modération de la salle"]);
  for (const width of [1440, 1024, 390, 360]) {
    await host.setViewportSize({ width, height: 900 });
    // Visual order: no region starts above the one before it.
    const tops: number[] = [];
    for (const name of REGIONS) tops.push(await top(region(host, name)));
    expect(tops, `width ${width}`).toEqual([...tops].sort((a, b) => a - b));
    const bots = region(host, /^Bots$/);
    expect(await top(bots.getByRole("heading", { name: "Ajouter un bot" }))).toBeLessThan(await top(bots.getByRole("heading", { name: "Bots dans la salle" })));
    // « Fermer la salle » alone under « Lancer la course », in the start plaque.
    const plaque = region(host, REGIONS[0]!);
    const start = await plaque.getByRole("button", { name: "Lancer la course" }).boundingBox();
    const close = await plaque.getByRole("button", { name: "Fermer la salle" }).boundingBox();
    if (!start || !close) throw new Error("start plaque");
    expect(close.y).toBeGreaterThanOrEqual(start.y + start.height);
    expect(await redActions(host)).toEqual(["Lancer la course"]);
    await expectNoHorizontalScroll(host);
  }
});

test("the crew is grouped, spectators have their own counter and the top counter keeps the places", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const code = await openRoom(host);
  await occupy(host, code, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
  const crew = region(host, /^Équipage$/);
  await expect(crew.getByText("16 / 20 participants", { exact: true })).toBeVisible();
  await expect(crew.getByRole("heading", { name: /^Participants/ })).toHaveText("Participants6");
  await expect(crew.getByRole("heading", { name: /^Spectateurs/ })).toHaveText("Spectateurs2 / 20");
  await expect(crew.getByRole("list", { name: /^Participants/ }).getByRole("listitem")).toHaveCount(6);
  await expect(crew.getByRole("list", { name: /^Spectateurs/ }).getByRole("listitem")).toHaveCount(2);
  await expect(crew.getByRole("listitem").first()).toContainText("Capitaine (toi)");
  await expect(region(host, /^Bots$/).getByRole("listitem")).toHaveCount(10);
  // A room without spectator still says so: the counter stays, the list does not.
  const alone = await account(browser, "Seule");
  await openRoom(alone);
  const emptyCrew = region(alone, /^Équipage$/);
  await expect(emptyCrew.getByRole("heading", { name: /^Spectateurs/ })).toHaveText("Spectateurs0 / 20");
  await expect(emptyCrew.getByRole("list")).toHaveCount(1);
  await expect(emptyCrew.getByText("1 / 30 participants", { exact: true })).toBeVisible();
});

test("the quay is decorative: eight hulls at most, then a count; pennants and eyes follow the roles", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const code = await openRoom(host);
  // Two strips, one shown at a time: eight hulls and the count from 1024 px, three hulls under it.
  const quay = host.locator("[data-quay]").first();
  const narrowQuay = host.locator("[data-quay]").nth(1);
  await expect(host.locator("[data-quay]")).toHaveCount(2);
  await expect(narrowQuay).toBeHidden();
  await expect(quay).toHaveAttribute("aria-hidden", "true");
  await expect(quay.locator("[data-quay-hull]")).toHaveCount(1);
  await expect(quay.locator("text")).toHaveCount(0);
  await occupy(host, code, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
  // Sixteen sail (six participants, ten bots): eight are drawn, humans first, the rest is a number.
  await expect(quay.locator("[data-quay-hull]")).toHaveCount(8);
  await expect(quay.locator('[data-quay-hull="triangle"]')).toHaveCount(6);
  await expect(quay.locator('[data-quay-hull="square"]')).toHaveCount(2);
  await expect(quay.locator("text")).toHaveText("+8 au mouillage");
  expect(await quay.evaluate((element) => getComputedStyle(element).pointerEvents)).toBe("none");
  // Nothing of it is in the accessibility tree: the crew list says who is there.
  expect(await host.getByRole("main").ariaSnapshot()).not.toContain("au mouillage");
  const crew = region(host, /^Équipage$/);
  await expect(crew.locator("[data-pennant]")).toHaveCount(6);
  await expect(crew.locator('[data-pennant][data-colour="moi"]')).toHaveCount(1);
  await expect(crew.getByRole("listitem").first().locator('[data-pennant][data-colour="moi"]')).toHaveCount(1);
  await expect(crew.locator("[data-spectator-eye]")).toHaveCount(2);
  await expect(crew.getByRole("list", { name: /^Spectateurs/ }).locator("[data-pennant]")).toHaveCount(0);
  // Bounded inside the page, and removed on a low screen.
  const [box, main] = [await quay.boundingBox(), await host.getByRole("main").boundingBox()];
  if (!box || !main) throw new Error("quay");
  expect(box.x).toBeGreaterThanOrEqual(main.x);
  expect(box.x + box.width).toBeLessThanOrEqual(main.x + main.width);
  expect(box.height).toBeLessThanOrEqual(150);
  await host.setViewportSize({ width: 1280, height: 640 });
  await expect(quay).toBeHidden();
  await expect(narrowQuay).toBeHidden();
  for (const width of [1023, 768, 390, 360]) {
    await host.setViewportSize({ width, height: 844 });
    await expect(quay).toBeHidden();
    await expect(narrowQuay).toBeVisible();
    await expect(narrowQuay).toHaveAttribute("aria-hidden", "true");
    // No word is drawn there, so none is clipped; every hull drawn is inside the strip.
    await expect(narrowQuay.locator("text")).toHaveCount(0);
    await expect(narrowQuay.locator("[data-quay-hull]")).toHaveCount(3);
    const strip = await narrowQuay.boundingBox();
    const last = await narrowQuay.locator("[data-quay-hull]").last().boundingBox();
    if (!strip || !last) throw new Error("narrow quay");
    expect(last.x + last.width, `width ${width}`).toBeLessThanOrEqual(strip.x + strip.width);
    await expectNoHorizontalScroll(host);
  }
  // From 1024 px the count is whole: it ends inside the strip.
  await host.setViewportSize({ width: 1024, height: 900 });
  const [wide, count] = [await quay.boundingBox(), await quay.locator("text").boundingBox()];
  if (!wide || !count) throw new Error("quay count");
  expect(count.x + count.width).toBeLessThanOrEqual(wide.x + wide.width);
});

test("a non-host sees the room in the same order without any host control; updates stay live", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const member = await account(browser, "Lina");
  const watcher = await account(browser, "Alix");
  const code = await openRoom(host);
  await occupy(host, code, { bots: 2 });
  await join(member, code);
  await join(watcher, code, true);
  for (const page of [member, watcher]) {
    const main = page.getByRole("main");
    await expect(main.getByRole("button")).toHaveText(["Quitter la salle", ""]); // leaving, and copying the code (an icon)
    await expect(main.getByRole("button", { name: "Copier le code" })).toBeVisible();
    await expect(main.getByRole("combobox")).toHaveCount(0);
    for (const name of [/^Invitations$/, /^Modération de la salle$/]) await expect(region(page, name)).toHaveCount(0);
    expect(await redActions(page)).toEqual([]);
    // The start note is read by everyone; only the host has the button.
    await expect(region(page, /^Code de la salle$/)).toContainText("Entraînement.");
    await expect(region(page, /^Bots$/).getByRole("listitem")).toHaveCount(2);
  }
  await expect(region(member, /^Équipage$/).getByRole("heading", { name: /^Spectateurs/ })).toHaveText("Spectateurs1 / 20");
  await expect(region(member, /^Équipage$/).getByText("4 / 30 participants", { exact: true })).toBeVisible();
  // Live: a bot added by the host reaches both pages, and the top counter follows.
  await region(host, /^Bots$/).getByRole("button", { name: "Ajouter un bot" }).click();
  for (const page of [member, watcher]) {
    await expect(region(page, /^Bots$/).getByRole("listitem")).toHaveCount(3);
    await expect(region(page, /^Équipage$/).getByText("5 / 30 participants", { exact: true })).toBeVisible();
  }
  await capture(member, "non-hote-fr-abysse-1440");
  await capture(watcher, "spectateur-fr-abysse-1440");
});

test("a full room keeps its add button and refuses after the attempt (30 / 30)", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const code = await openRoom(host);
  await occupy(host, code, { participants: 19, spectators: 3, bots: 10, capacity: 30 });
  const bots = region(host, /^Bots$/);
  await expect(region(host, /^Équipage$/).getByText("30 / 30 participants", { exact: true })).toBeVisible();
  const add = bots.getByRole("button", { name: "Ajouter un bot" });
  await expect(add).toBeEnabled();
  await expect(bots.getByRole("alert")).toHaveCount(0);
  await add.click();
  await expect(bots.getByRole("alert")).toContainText("La salle est complète : humains et bots partagent les places.");
  await expect(bots.getByRole("listitem")).toHaveCount(10);
  await expectNoAccessibilityViolation(host);
  await capture(host, "complete-30-30-fr-abysse-1440");
  await bots.getByRole("button", { name: "Recharger la salle" }).click();
  await expect(bots.getByRole("alert")).toHaveCount(0);
  await expect(add).toBeEnabled();
});

test("on a low 1280 × 640 screen the code and the start are in view", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const code = await openRoom(host);
  await occupy(host, code, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
  await host.setViewportSize({ width: 1280, height: 640 });
  for (const control of [host.getByText(code, { exact: true }), host.getByRole("button", { name: "Lancer la course" })]) {
    const box = await control.boundingBox();
    if (!box) throw new Error("start plaque");
    expect(box.y + box.height).toBeLessThanOrEqual(640);
  }
  await expectNoHorizontalScroll(host);
  await capture(host, "ecran-bas-1280x640-fr-abysse", false);
});

for (const locale of ["fr-CA", "en-US"] as const) for (const theme of ["abysse", "aube"] as const) {
  test(`ten bots: accessible and without horizontal scroll at the reference widths (${locale}, ${theme})`, async ({ browser }) => {
    const host = await account(browser, "Capitaine", { locale, theme });
    const code = await openRoom(host);
    await occupy(host, code, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
    await expect(host.locator("html")).toHaveAttribute("data-theme", theme);
    // As the mock-up: one line with an unsaved draft, one open and clean (DA2-5b).
    const bots = region(host, /^Bots$/).getByRole("listitem");
    await bots.nth(1).getByRole("button", { name: /^(Modifier|Edit) Bot 2$/ }).click();
    await bots.nth(1).getByRole("combobox").selectOption("expert");
    await bots.nth(6).getByRole("button", { name: /^(Modifier|Edit) Bot 7$/ }).click();
    await expect(bots.nth(1).getByText(/^(Non enregistré|Unsaved)$/)).toBeVisible();
    // Screen reader: the open and unsaved states are in the tree (expanded, status), not only on screen.
    const tree = await region(host, /^Bots$/).ariaSnapshot();
    expect(tree).toMatch(/button "(Annuler :|Cancel:) Bot 2" \[expanded\]/);
    expect(tree).toMatch(/status: "?(Modification non enregistrée|Unsaved change)/);
    expect(tree).toMatch(/button "(Modifier|Edit) Bot 1"(?! \[expanded\])/);
    if (EVIDENCE !== undefined && theme === "abysse") await writeFile(`${EVIDENCE}/arbre-accessibilite-bots-${locale.slice(0, 2)}.txt`, tree);
    for (const width of [1440, 1024, 390, 360]) {
      await host.setViewportSize({ width, height: 900 });
      await expectNoHorizontalScroll(host);
      await expectNoAccessibilityViolation(host);
      // Targets: every control of the page is at least 44 px high.
      const heights = await host.getByRole("main").locator("button, select, input:not([type=hidden])").evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
      expect(Math.min(...heights), `width ${width}`).toBeGreaterThanOrEqual(44);
      await capture(host, `dix-bots-${locale.slice(0, 2)}-${theme}-${width}`);
    }
  });
}

for (const theme of ["abysse", "aube"] as const) for (const bots of [0, 2] as const) {
  test(`${bots} bot(s): empty and short rosters (${theme})`, async ({ browser }) => {
    const host = await account(browser, "Capitaine", { theme });
    const code = await openRoom(host);
    await occupy(host, code, { participants: 2, spectators: 1, bots });
    const panel = region(host, /^Bots$/);
    await expect(panel.getByRole("listitem")).toHaveCount(bots);
    if (bots === 0) await expect(panel.getByText("Aucun bot dans cette salle.")).toBeVisible();
    for (const width of [1440, 390]) {
      await host.setViewportSize({ width, height: 900 });
      await expectNoHorizontalScroll(host);
      await expectNoAccessibilityViolation(host);
      await capture(host, `${bots === 0 ? "sans-bot" : "deux-bots"}-fr-${theme}-${width}`);
    }
  });
}

test("forced colours and a 200 % zoom keep every state readable", async ({ browser }) => {
  const forced = await account(browser, "Capitaine", { forcedColors: true });
  const code = await openRoom(forced);
  await occupy(forced, code, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
  const lines = region(forced, /^Bots$/).getByRole("listitem");
  await lines.nth(1).getByRole("button", { name: "Modifier Bot 2" }).click();
  await lines.nth(1).getByRole("combobox").selectOption("expert");
  await lines.nth(6).getByRole("button", { name: "Modifier Bot 7" }).click();
  await expectNoHorizontalScroll(forced);
  await capture(forced, "couleurs-forcees-fr-1440");
  // 200 % on a 1440 px screen is a 720 px layout.
  const zoomed = await account(browser, "Zoom");
  const zoomedCode = await openRoom(zoomed);
  await occupy(zoomed, zoomedCode, { participants: 5, spectators: 2, bots: 10, capacity: 20 });
  await zoomed.setViewportSize({ width: 720, height: 450 });
  await expectNoHorizontalScroll(zoomed);
  await expect(zoomed.getByRole("button", { name: "Lancer la course" })).toBeVisible();
  await capture(zoomed, "zoom-200-fr-abysse-720");
});

test("keyboard only: every stop of the room shows its focus, in the page's order", async ({ browser }) => {
  const host = await account(browser, "Capitaine");
  const code = await openRoom(host);
  await occupy(host, code, { participants: 2, spectators: 1, bots: 2 });
  const expected = await host.getByRole("main").locator("button:not([disabled]), select:not([disabled]), input:not([disabled]):not([type=hidden]), a[href]").evaluateAll((controls) => controls.map((control) => control.getAttribute("aria-label") ?? control.textContent ?? ""));
  await host.getByRole("heading", { level: 1 }).focus();
  const visited: string[] = [];
  for (let stop = 0; stop < expected.length; stop++) {
    await host.keyboard.press("Tab");
    const focused = host.locator(":focus");
    visited.push(await focused.evaluate((control) => control.getAttribute("aria-label") ?? control.textContent ?? ""));
    // The global ring: 3 px in the `moi` colour, on every surface.
    expect(await focused.evaluate((control) => getComputedStyle(control).outlineWidth), visited.at(-1)).toBe("3px");
  }
  expect(visited).toEqual(expected);
  expect(visited.slice(0, 4)).toEqual(["Quitter la salle", "Copier le code", "Lancer la course", "Fermer la salle"]);
});

test("screen reader: names, roles and states of the room, as the accessibility tree gives them", async ({ browser }) => {
  for (const [name, role] of [["Capitaine", "host"], ["Lina", "member"]] as const) {
    const page = await account(browser, name);
    let code = "";
    if (role === "host") { code = await openRoom(page); await occupy(page, code, { participants: 1, spectators: 1, bots: 2 }); }
    else { const [room] = await query<{ code: string }>("select code from lobbies limit 1"); await join(page, room?.code ?? ""); }
    const tree = await page.getByRole("main").ariaSnapshot();
    for (const expected of ['region "Code de la salle"', 'region "Réglages de la course"', 'region "Équipage"', 'heading "Participants', 'heading "Spectateurs', 'region "Bots"', 'heading "Bots dans la salle"']) expect(tree, role).toContain(expected);
    expect(tree.includes('button "Lancer la course"'), role).toBe(role === "host");
    expect(tree.includes('region "Modération de la salle"'), role).toBe(role === "host");
    // The decorations (quay, pennants, eyes, insignias) are not announced.
    expect(tree).not.toMatch(/img(?! "Invité")/);
    if (EVIDENCE !== undefined) await writeFile(`${EVIDENCE}/arbre-accessibilite-${role === "host" ? "hote" : "non-hote"}-fr.txt`, tree.replace(/[2-9A-HJKMNP-Z]{6}/g, "CODE00"));
    if (role === "member") break;
  }
});
