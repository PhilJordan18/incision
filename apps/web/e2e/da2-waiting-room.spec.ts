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
