import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { crew, expectResults, giveUp, isDisposableDatabase, restoreResultsTable, roomResults, sailor, seedRace, setLocale, setResultsTableAside, setTheme } from "./da2-results-fixture";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, query } from "./support";

/**
 * DA2-7: the C1 pieces on the screens after the race (results, race page, history, account),
 * checked on the running app. The functional assertions of these screens stay in their own specs.
 */
const contexts: BrowserContext[] = [];
// A run cut short while the results table was set aside must not break the next one. Disposable test database only.
test.beforeAll(restoreResultsTable);
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

type Drawn = { readonly shape: string | null; readonly colour: string | null; readonly dash: string | null };

async function pennantOf(scope: Locator): Promise<Drawn> {
  const pennant = scope.locator("svg[data-pennant]");
  await expect(pennant).toHaveCount(1);
  await expect(pennant).toHaveAttribute("aria-hidden", "true");
  return { shape: await pennant.getAttribute("data-pennant"), colour: await pennant.getAttribute("data-colour"), dash: await pennant.getAttribute("data-dash") };
}

/** WCAG contrast of two computed colours (`rgb()`, `rgba()` or `color(srgb …)`), the first drawn over the second. */
async function contrast(page: Page, front: string, back: string): Promise<number> {
  return page.evaluate(([a, b]) => {
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    const luminance = (colour: string) => {
      context.clearRect(0, 0, 1, 1); context.fillStyle = b!; context.fillRect(0, 0, 1, 1);
      context.fillStyle = colour; context.fillRect(0, 0, 1, 1);
      const [red, green, blue] = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map((value) => {
        const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!;
    };
    const [one, two] = [luminance(a!), luminance(b!)];
    return (Math.max(one, two) + 0.05) / (Math.min(one, two) + 0.05);
  }, [front, back]);
}

/** What is painted behind an element: its ancestors' backgrounds, composited from the page down. */
async function backdrop(element: Locator): Promise<string> {
  return element.evaluate((node) => {
    const layers: string[] = [];
    for (let current = node.parentElement; current !== null; current = current.parentElement) layers.unshift(getComputedStyle(current).backgroundColor);
    const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d", { willReadFrequently: true })!;
    for (const layer of layers) { context.fillStyle = layer; context.fillRect(0, 0, 1, 1); }
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return `rgb(${red}, ${green}, ${blue})`;
  });
}

test("room results: each pennant has its runner's shape, the reader's own has its track colour, no other claims one; host and non-host; then the same pennant on the race page", async ({ browser }) => {
  test.setTimeout(120_000);
  const host = await sailor(browser, "Capitaine"); const guest = await sailor(browser, "Lina", { locale: "en-US" });
  contexts.push(host.context, guest.context);
  const { raceId } = await roomResults(host, guest);
  // What each reader's own track drew, by race entrant id.
  const seen = new Map<Page, Map<string, { colour: string | null; kind: string | null; self: boolean }>>();
  for (const { page } of [host, guest]) {
    const markers = page.getByTestId("race-track").locator("[data-runner]");
    await expect(markers).toHaveCount(3);
    const drawn = new Map<string, { colour: string | null; kind: string | null; self: boolean }>();
    for (const marker of await markers.all()) {
      drawn.set((await marker.getAttribute("data-runner"))!, { colour: await marker.getAttribute("data-route-colour"),
        kind: await marker.getAttribute("data-kind"), self: await marker.getAttribute("data-self") === "true" });
    }
    seen.set(page, drawn);
  }
  await giveUp(guest.page); await giveUp(host.page);
  const entrants = await query<{ id: string; ordinal: number; kind: string; account_id: string | null }>(
    "select id, ordinal, kind, account_id from race_entrants where race_id=$1 order by ordinal", [raceId]);
  expect(entrants).toHaveLength(3);
  for (const reader of [host, guest]) {
    const { page } = reader;
    await expectResults(page);
    const results = page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) }).first();
    const table = results.getByRole("table").first();
    for (const entrant of entrants) {
      const track = seen.get(page)!.get(entrant.id)!;
      const row = await pennantOf(table.locator(`[data-result-entrant="${entrant.ordinal}"]`));
      // The shape is the sail's: a square for a bot, a triangle for a human.
      expect(row.shape).toBe(track.kind === "bot" ? "square" : "triangle");
      expect(entrant.kind === "bot").toBe(track.kind === "bot");
      if (entrant.account_id === reader.accountId) {
        expect(track.self).toBe(true);
        expect(row).toEqual({ shape: "triangle", colour: "moi", dash: "solid" });
      } else {
        // The stored results do not carry the race entrant id the track assigns colours by
        // (reported with DA2-7): another runner's pennant claims no runner colour and no dash.
        // When the projection carries the id, this becomes `track.colour` and the track's dash.
        expect(track.self).toBe(false);
        expect(row.colour).toBe("ecume");
        expect(row.dash).toBe("solid");
      }
      // The same pennant in the bonus journal, and in the podium for the first three.
      const journal = await pennantOf(page.locator(`summary[data-result-entrant="${entrant.ordinal}"]`));
      expect(journal).toEqual(row);
      expect(await pennantOf(results.getByRole("list").locator(`[data-result-entrant="${entrant.ordinal}"]`))).toEqual(row);
    }
    // The coast replaces the mist: one coast, no halo, and nothing drawn reaches a screen reader.
    await expect(results.locator("[data-arrival-shore] [data-coast]")).toHaveCount(1);
    await expect(page.locator("[data-coast]")).toHaveCount(1);
    await expect(page.locator(".red-mist")).toHaveCount(0);
    await expect(results.locator('svg:not([aria-hidden="true"])')).toHaveCount(0);
    await expect(table.getByRole("columnheader")).toHaveCount(8);
    await expect(table.getByRole("rowheader")).toHaveCount(3);
    // A runner's name is still the row's whole header: the pennant adds no name, no text.
    const selfName = reader === host ? "Capitaine (toi)" : "Lina (you)";
    await expect(table.getByRole("rowheader", { name: selfName, exact: true })).toHaveCount(1);
  }
  // One red action for the host (« Prochaine manche »), none for the other member.
  await expect(host.page.getByRole("main").locator(".bg-action")).toHaveCount(1);
  await expect(host.page.getByRole("main").locator(".bg-action")).toHaveText("Prochaine manche");
  await expect(guest.page.getByRole("main").locator(".bg-action")).toHaveCount(0);
  await expect(guest.page.getByRole("button", { name: "Next round", exact: true })).toHaveCount(0);
  await expect(guest.page.getByRole("link", { name: "Open the race page", exact: true })).toBeVisible();
  for (const { page } of [host, guest]) for (const theme of ["abysse", "aube"] as const) {
    await setTheme(page.context(), theme); await page.reload(); await expectResults(page);
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 640 }, { width: 1024, height: 768 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
      await page.setViewportSize(size);
      await expectNoHorizontalScroll(page);
    }
    await expectNoAccessibilityViolation(page);
  }
  // Race → podium → table → journal → legend: on the race page, the legend shows the same
  // pennant as the room's table did for each entrant, and so do the page's own lists.
  const inRoom = new Map<number, Drawn>();
  for (const entrant of entrants) inRoom.set(entrant.ordinal, await pennantOf(guest.page.getByRole("table").first().locator(`[data-result-entrant="${entrant.ordinal}"]`)));
  await guest.page.getByRole("link", { name: "Open the race page", exact: true }).click();
  await expect(guest.page).toHaveURL(new RegExp(`/races/${raceId}$`));
  const legend = guest.page.getByRole("region", { name: "Speed during the race", exact: true }).locator("ol > li[data-result-entrant]");
  await expect(legend).toHaveCount(entrants.length);
  for (const entrant of entrants) {
    const expected = inRoom.get(entrant.ordinal)!;
    expect(await pennantOf(guest.page.locator(`ol > li[data-result-entrant="${entrant.ordinal}"]`)), "legend").toEqual(expected);
    expect(await pennantOf(guest.page.getByRole("table").first().locator(`[data-result-entrant="${entrant.ordinal}"]`)), "table").toEqual(expected);
    expect(await pennantOf(guest.page.locator(`summary[data-result-entrant="${entrant.ordinal}"]`)), "journal").toEqual(expected);
    expect(await pennantOf(guest.page.getByRole("region", { name: "Podium", exact: true }).locator(`[data-result-entrant="${entrant.ordinal}"]`)), "podium").toEqual(expected);
  }
});

for (const locale of ["fr", "en"] as const) test(`race page: pennants, coast and focus stay readable in both themes (${locale})`, async ({ browser }) => {
  test.setTimeout(120_000);
  const reader = await sailor(browser, "Capitaine"); const other = await sailor(browser, "Lina");
  contexts.push(reader.context, other.context);
  const race = await seedRace(crew(reader.accountId, other.accountId), { round: 3 });
  const { page } = reader;
  await setLocale(reader.context, locale);
  for (const theme of ["abysse", "aube"] as const) {
    await setTheme(reader.context, theme);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/races/${race.id}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const speed = page.getByRole("region", { name: locale === "fr" ? "Vitesse pendant la course" : "Speed during the race", exact: true });
    // The legend: one pennant per entrant, the shape by kind; curves and tables as before.
    const legend = speed.locator("ol > li[data-result-entrant]");
    await expect(legend).toHaveCount(5);
    expect(await Promise.all((await legend.all()).map(async (item) => (await pennantOf(item)).shape)))
      .toEqual(["triangle", "triangle", "square", "triangle", "square"]);
    expect((await pennantOf(legend.nth(1))).colour).toBe("moi");
    await expect(speed.locator("svg[role=img]").first().locator("polyline")).toHaveCount(5);
    await expect(page.getByRole("region", { name: locale === "fr" ? "Tes caractères manqués" : "Your missed characters", exact: true })).toBeVisible();
    // Non-text contrast (WCAG 1.4.11): every pennant's cloth and staff against what is behind it.
    for (const pennant of await page.locator("svg[data-pennant]").all()) {
      const behind = await backdrop(pennant);
      for (const part of ["[data-pennant-cloth]", "path:first-child"]) {
        const style = await pennant.locator(part).first().evaluate((node) => { const computed = getComputedStyle(node); return computed.fill === "none" ? computed.stroke : computed.fill; });
        expect(await contrast(page, style, behind), `${theme} ${part} ${style} on ${behind}`).toBeGreaterThanOrEqual(3);
      }
    }
    // The coast reads as land: its edge stands out from the land and from the sea, the land from the sea.
    const shore = page.locator("[data-arrival-shore]");
    const sea = await shore.evaluate((node) => getComputedStyle(node).backgroundColor);
    const land = await shore.locator("[data-coast-land]").evaluate((node) => getComputedStyle(node).fill);
    const edge = await shore.locator("[data-coast-edge]").evaluate((node) => getComputedStyle(node).stroke);
    expect(await contrast(page, edge, sea), `${theme} edge on sea`).toBeGreaterThanOrEqual(3);
    expect(await contrast(page, edge, land), `${theme} edge on land`).toBeGreaterThanOrEqual(3);
    expect(land).not.toBe(sea);
    for (const sail of await shore.locator("[data-sail-cloth]").all()) {
      expect(await contrast(page, await sail.evaluate((node) => getComputedStyle(node).fill), sea), `${theme} sail on sea`).toBeGreaterThanOrEqual(3);
    }
    // Keyboard only: every stop shows a focus ring that stands out from its surface.
    const stops = new Set<string>();
    for (let index = 0; index < 60; index++) {
      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      if (await focused.count() === 0) break;
      const ring = await focused.evaluate((node) => {
        const computed = getComputedStyle(node);
        return { key: `${node.tagName}:${node.textContent?.slice(0, 40)}:${node.getBoundingClientRect().top}`, width: Number.parseFloat(computed.outlineWidth), style: computed.outlineStyle, colour: computed.outlineColor };
      });
      if (stops.has(ring.key)) break;
      stops.add(ring.key);
      expect(ring.style, ring.key).not.toBe("none");
      expect(ring.width, ring.key).toBeGreaterThanOrEqual(2);
      expect(await contrast(page, ring.colour, await backdrop(focused)), `${theme} focus ring at ${ring.key}`).toBeGreaterThanOrEqual(3);
    }
    expect(stops.size).toBeGreaterThan(8);
    for (const size of [{ width: 1440, height: 900 }, { width: 1280, height: 640 }, { width: 1024, height: 768 }, { width: 720, height: 450 }, { width: 390, height: 844 }, { width: 360, height: 780 }]) {
      await page.setViewportSize(size);
      await expectNoHorizontalScroll(page);
      // The ships stay inside their scene, and no mast or sail reaches the coast (its shore is
      // never deeper than 90 % of its band).
      const box = (await shore.boundingBox())!;
      const band = (await shore.locator("[data-coast]").boundingBox())!;
      for (const part of await shore.locator("[data-ship] path, [data-ship] rect").all()) {
        expect((await part.boundingBox())!.y, `ship under the coast at ${size.width} px`).toBeGreaterThanOrEqual(band.y + band.height * 0.9);
      }
      for (const ship of await shore.locator("[data-ship] [data-sail-cloth]").all()) {
        const sail = (await ship.boundingBox())!;
        expect(sail.x).toBeGreaterThanOrEqual(box.x); expect(sail.x + sail.width).toBeLessThanOrEqual(box.x + box.width);
        expect(sail.y + sail.height).toBeLessThanOrEqual(box.y + box.height);
      }
    }
    await expectNoAccessibilityViolation(page);
  }
  // Forced colours, set on the context so the browser repaints with the system palette: every
  // shape takes a system colour, and kind still reads by shape. The light system palette only:
  // headless Chromium does not paint a dark forced palette faithfully.
  for (const scheme of ["light"] as const) {
    const forced = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: "fr-CA", reducedMotion: "reduce", forcedColors: "active", colorScheme: scheme });
    contexts.push(forced);
    await forced.addCookies(await reader.context.cookies());
    const contrasted = await forced.newPage();
    await contrasted.goto(`/races/${race.id}`);
    const system = await contrasted.evaluate(() => {
      const probe = document.createElement("span"); probe.style.color = "CanvasText"; probe.style.backgroundColor = "Canvas"; document.body.append(probe);
      const computed = getComputedStyle(probe); const colours = { text: computed.color, canvas: computed.backgroundColor }; probe.remove(); return colours;
    });
    expect(system.text).not.toBe(system.canvas);
    for (const cloth of await contrasted.locator("[data-pennant-cloth], [data-sail-cloth]").all()) {
      expect(await cloth.evaluate((node) => getComputedStyle(node).fill)).toBe(system.text);
      expect(await backdrop(cloth), `${scheme} surface behind a shape`).toBe(system.canvas);
    }
    expect(await contrasted.locator("[data-coast-land]").evaluate((node) => getComputedStyle(node).fill)).toBe(system.canvas);
    expect(await contrasted.locator("[data-coast-edge]").evaluate((node) => getComputedStyle(node).stroke)).toBe(system.text);
    await expect(contrasted.locator('svg[data-pennant="square"]').first()).toBeVisible();
    await expect(contrasted.locator('svg[data-pennant="triangle"]').first()).toBeVisible();
    await expectNoHorizontalScroll(contrasted);
  }
});

for (const locale of ["fr", "en"] as const) test(`history and account: wave marks behind the title, states intact, both themes (${locale})`, async ({ browser }) => {
  test.setTimeout(120_000);
  const reader = await sailor(browser, "Capitaine"); const other = await sailor(browser, "Lina");
  contexts.push(reader.context, other.context);
  const { page } = reader;
  await setLocale(reader.context, locale);
  const sizes = [{ width: 1440, height: 900 }, { width: 1280, height: 640 }, { width: 1024, height: 768 }, { width: 720, height: 450 }, { width: 390, height: 844 }, { width: 360, height: 780 }];
  const check = async (path: string, expectation: () => Promise<void>) => {
    for (const theme of ["abysse", "aube"] as const) {
      await setTheme(reader.context, theme);
      await page.setViewportSize(sizes[0]!);
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await expectation();
      // One band of wave marks, behind the title: hidden from assistive technology, never a target.
      const marks = page.getByRole("main").locator("svg[data-wave-marks]");
      await expect(marks).toHaveCount(1);
      await expect(marks).toHaveAttribute("aria-hidden", "true");
      expect(await marks.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe("none");
      const heading = page.getByRole("heading", { level: 1 });
      expect(await heading.evaluate((node) => document.elementFromPoint(node.getBoundingClientRect().left + 4, node.getBoundingClientRect().top + 12) === node || node.contains(document.elementFromPoint(node.getBoundingClientRect().left + 4, node.getBoundingClientRect().top + 12)))).toBe(true);
      await expect(page.locator("[data-coast], .red-mist")).toHaveCount(0);
      for (const size of sizes) { await page.setViewportSize(size); await expectNoHorizontalScroll(page); }
      await expectNoAccessibilityViolation(page);
    }
  };
  const fr = locale === "fr";
  // Empty history, then an invalid page.
  await check("/history", async () => { await expect(page.getByText(fr ? "Aucune course sur cette page." : "No races on this page.", { exact: true })).toBeVisible(); });
  await check("/history?cursor=a&cursor=b", async () => {
    await expect(page.getByRole("main").getByRole("alert")).toHaveText(fr ? "Cette page d’historique n’est pas valide." : "This history page is not valid.");
  });
  for (let round = 1; round <= 3; round++) await seedRace(crew(reader.accountId, other.accountId), { round, endedAt: `2026-11-1${round}T19:0${round}:00Z` });
  await check("/history", async () => {
    await expect(page.getByRole("table").getByRole("columnheader")).toHaveCount(7);
    await expect(page.getByRole("table").getByRole("row")).toHaveCount(4);
  });
  await check("/account", async () => {
    // The shared panel title on every panel; « Enregistrer le nom » is the page's one red action.
    const titles = page.getByRole("main").locator("h2, h3");
    await expect(titles).toHaveCount(4);
    const fonts = await titles.evaluateAll((nodes) => nodes.map((node) => { const computed = getComputedStyle(node); return `${computed.fontFamily}|${computed.fontSize}|${computed.fontWeight}|${computed.textTransform}`; }));
    expect(new Set(fonts).size).toBe(1);
    await expect(page.getByRole("main").locator(".bg-action")).toHaveCount(1);
    await expect(page.getByRole("main").locator(".bg-action")).toHaveText(fr ? "Enregistrer le nom" : "Save display name");
    await expect(page.locator('[data-stat="races"]')).toHaveText("3");
  });
  // Unavailable cards: the results table is out of reach, on this disposable database only.
  await setResultsTableAside();
  try {
    await check("/history", async () => {
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(fr ? "Ton historique est indisponible pour le moment." : "Your history is unavailable right now.");
    });
    await check("/account", async () => {
      await expect(page.getByRole("region", { name: fr ? "Tes statistiques" : "Your statistics" }).getByRole("alert")).toBeVisible();
      await expect(page.locator("[data-stat]")).toHaveCount(0);
    });
  } finally {
    await restoreResultsTable();
  }
});

test("who may read the results: host, member, guest, spectator, outsider and signed-out visitor", async ({ browser }) => {
  test.setTimeout(150_000);
  const host = await sailor(browser, "Capitaine"); const member = await sailor(browser, "Lina");
  const watcher = await sailor(browser, "Vigie"); const outsider = await sailor(browser, "Passant");
  const visitor = await browser.newContext({ locale: "fr-CA", reducedMotion: "reduce" });
  const signedOut = await browser.newContext({ locale: "fr-CA", reducedMotion: "reduce" });
  contexts.push(host.context, member.context, watcher.context, outsider.context, visitor, signedOut);
  await query("update lobbies set host_member_id=null"); await query("delete from lobbies");
  await host.page.goto("/rooms/new");
  await host.page.getByRole("button", { name: "Ouvrir la salle", exact: true }).click();
  await expect(host.page.getByText("[.En direct]", { exact: true })).toBeVisible();
  const code = host.page.url().split("/").at(-1)!;
  const [room] = await query<{ id: string }>("select id from lobbies where code=$1", [code]);
  await member.page.goto(`/rooms/${code}`);
  await member.page.getByRole("button", { name: "Rejoindre la salle", exact: true }).click();
  await expect(member.page.getByText("[.En direct]", { exact: true })).toBeVisible();
  // A guest enters through the guest form; a spectator is seated by a fixture row (admission has its own specs).
  const guestPage = await visitor.newPage();
  await guestPage.goto(`/guest?code=${code}`);
  await guestPage.getByLabel("Pseudo pour cette salle").fill("Mousse");
  await guestPage.getByRole("button", { name: "Entrer dans la salle", exact: true }).click();
  await expect(guestPage.getByText("[.En direct]", { exact: true })).toBeVisible();
  await query(`insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical) values ($1, $2, 'spectator', 'Vigie', 'vigie')`, [room!.id, watcher.accountId]);
  await watcher.page.goto(`/rooms/${code}`);
  await expect(watcher.page.getByText("[.En direct]", { exact: true })).toBeVisible();
  const bots = host.page.getByRole("region", { name: "Bots", exact: true });
  await bots.getByRole("combobox").first().selectOption("impossible");
  await bots.getByRole("button", { name: "Ajouter un bot", exact: true }).click();
  await expect(bots.getByRole("listitem")).toHaveCount(1);
  await host.page.getByRole("button", { name: "Lancer la course", exact: true }).click();
  const runners = [host.page, member.page, guestPage];
  for (const page of runners) await expect(page.getByLabel("Ta frappe", { exact: true })).toBeEnabled({ timeout: 15_000 });
  const [race] = await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [code]);
  const entrantIds = (await query<{ id: string }>("select id from race_entrants where race_id=$1", [race!.id])).map((row) => row.id);
  expect(entrantIds).toHaveLength(4);
  for (const page of runners) await giveUp(page);
  for (const page of [...runners, watcher.page]) await expectResults(page);

  for (const page of [...runners, watcher.page]) {
    const table = page.getByRole("table").first();
    // Everyone admitted reads the same four rows, each with one pennant; the journal lists the same four.
    await expect(table.getByRole("rowheader")).toHaveCount(4);
    await expect(table.locator("svg[data-pennant]")).toHaveCount(4);
    await expect(table.locator('svg[data-pennant="square"]')).toHaveCount(1);
    await expect(page.locator("summary[data-result-entrant] svg[data-pennant]")).toHaveCount(4);
    // The results as the server renders them carry no race entrant id: neither the document a
    // reload returns, nor the page it builds. (During the race the ids are in the broadcast.)
    const response = await page.reload();
    await expectResults(page);
    const served = `${await response!.text()}${await page.content()}`;
    for (const id of entrantIds) expect(served).not.toContain(id);
  }
  // A runner sees one pennant in their own colour, on their own row; the arrival scene is theirs.
  for (const page of runners) {
    const table = page.getByRole("table").first();
    await expect(table.locator('svg[data-pennant][data-colour="moi"]')).toHaveCount(1);
    await expect(table.getByRole("row").filter({ hasText: "(toi)" }).locator('svg[data-pennant][data-colour="moi"]')).toHaveCount(1);
    await expect(page.locator("[data-arrival-shore] [data-coast]")).toHaveCount(1);
    await expect(page.locator('[data-arrival-shore] [data-ship][data-colour="moi"]')).toHaveCount(1);
  }
  // A spectator has no route of their own: no `moi` pennant, no rank, no arrival scene, the same table.
  await expect(watcher.page.getByText("Tu n’as pas couru cette manche.", { exact: true })).toBeVisible();
  await expect(watcher.page.locator('svg[data-pennant][data-colour="moi"]')).toHaveCount(0);
  await expect(watcher.page.locator("[data-arrival-shore], [data-coast]")).toHaveCount(0);
  // Only the host has the red action; only account entrants get the link to the race page.
  await expect(host.page.getByRole("main").locator(".bg-action")).toHaveText("Prochaine manche");
  for (const page of [member.page, guestPage, watcher.page]) await expect(page.getByRole("main").locator(".bg-action")).toHaveCount(0);
  await expect(member.page.getByRole("link", { name: "Voir la fiche de la course", exact: true })).toBeVisible();
  for (const page of [guestPage, watcher.page]) await expect(page.getByRole("link", { name: "Voir la fiche de la course", exact: true })).toHaveCount(0);

  // The race page stays its account entrants' only: the member reads it, nobody else gets a pennant.
  const path = `/races/${race!.id}`;
  await member.page.goto(path);
  await expect(member.page.getByRole("table").first().locator("svg[data-pennant]")).toHaveCount(4);
  for (const page of [watcher.page, outsider.page]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/introuvable/i);
    await expect(page.locator("svg[data-pennant], [data-coast]")).toHaveCount(0);
  }
  // An account that is not a member opens the room during the results: the room's own page, no results.
  await outsider.page.goto(`/rooms/${code}`);
  await expect(outsider.page).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(outsider.page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(outsider.page.getByRole("heading", { level: 1 })).not.toContainText(/Fin de la/i);
  await expect(outsider.page.locator("svg[data-pennant], [data-coast]")).toHaveCount(0);
  await guestPage.goto(path);
  await expect(guestPage).toHaveURL(/\/sign-in/);
  const stranger = await signedOut.newPage();
  await stranger.goto(path);
  await expect(stranger).toHaveURL(/\/sign-in/);
  await stranger.goto(`/rooms/${code}`);
  await expect(stranger).toHaveURL(/\/sign-in/);
  await expect(stranger.locator("svg[data-pennant], [data-coast]")).toHaveCount(0);
});

for (const theme of ["abysse", "aube"] as const) test(`account: the name and photo forms while a save is pending (${theme})`, async ({ browser }) => {
  const reader = await sailor(browser, "Capitaine");
  contexts.push(reader.context);
  const { page } = reader;
  await setTheme(reader.context, theme);
  const evidence = process.env.DA2_CAPTURES;
  const shoot = async (name: string) => {
    if (evidence !== undefined) await page.screenshot({ path: `${evidence}/${name}-fr-${theme}-1440.jpg`, type: "jpeg", quality: 72, fullPage: true });
  };
  // The photo: the request is held, so the form stays in its pending state.
  await page.goto("/account");
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/account/photo", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    await held; await route.continue();
  });
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Photo de profil", { exact: true }).setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: pixel });
  const photoForm = page.locator("form").filter({ has: page.locator("#profile-photo") });
  await photoForm.getByRole("button", { name: "Enregistrer la photo", exact: true }).click();
  try {
    await expect(photoForm).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#profile-photo")).toBeDisabled();
    const savingPhoto = photoForm.getByRole("button", { name: "Enregistrement…", exact: true });
    await expect(savingPhoto).toHaveAttribute("aria-disabled", "true");
    // The pending word is the state, not a colour alone; the page keeps its one red action and its title band.
    await expect(page.getByRole("main").locator(".bg-action")).toHaveCount(1);
    await expect(page.getByRole("main").locator("svg[data-wave-marks]")).toHaveCount(1);
    await expectNoAccessibilityViolation(page);
    await expectNoHorizontalScroll(page);
    await shoot("account-photo-pending");
  } finally {
    release();
  }
  await expect(photoForm).toHaveAttribute("aria-busy", "false");
  await page.unroute("**/api/account/photo");

  // The name: the server action's request is held the same way.
  await page.goto("/account");
  let releaseName: () => void = () => {};
  const heldName = new Promise<void>((resolve) => { releaseName = resolve; });
  await page.route("**/account", async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    await heldName; await route.continue();
  });
  const nameForm = page.locator("form").filter({ has: page.locator("#display-name") });
  await page.locator("#display-name").fill("Capitaine Cap");
  await nameForm.getByRole("button", { name: "Enregistrer le nom", exact: true }).click();
  try {
    await expect(nameForm).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#display-name")).toHaveAttribute("readonly", "");
    const savingName = nameForm.getByRole("button", { name: "Enregistrement…", exact: true });
    await expect(savingName).toHaveAttribute("aria-disabled", "true");
    // Still the page's one red action while it waits.
    await expect(page.getByRole("main").locator(".bg-action")).toHaveCount(1);
    await expect(savingName).toHaveClass(/bg-action/);
    await expectNoAccessibilityViolation(page);
    await shoot("account-name-pending");
  } finally {
    releaseName();
  }
  await expect(page.getByRole("status").filter({ hasText: "Nom enregistré." })).toBeVisible();
  await expect(nameForm).toHaveAttribute("aria-busy", "false");
});

test("forced colours: wave marks, pennants and the coast take system colours on every screen of the card", async ({ browser }) => {
  test.setTimeout(120_000);
  const reader = await sailor(browser, "Capitaine", { forcedColors: "active", colorScheme: "light" });
  const other = await sailor(browser, "Lina", { forcedColors: "active", colorScheme: "light" });
  contexts.push(reader.context, other.context);
  const system = async (page: Page) => page.evaluate(() => {
    const probe = document.createElement("span"); probe.style.color = "CanvasText"; probe.style.backgroundColor = "Canvas"; document.body.append(probe);
    const computed = getComputedStyle(probe); const colours = { text: computed.color, canvas: computed.backgroundColor }; probe.remove(); return colours;
  });
  await seedRace(crew(reader.accountId, other.accountId));
  for (const path of ["/history", "/account"]) {
    await reader.page.goto(path);
    expect(await reader.page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
    const colours = await system(reader.page);
    const marks = reader.page.getByRole("main").locator("svg[data-wave-marks] path");
    expect(await marks.count()).toBeGreaterThan(3);
    for (const mark of await marks.all()) expect(await mark.evaluate((node) => getComputedStyle(node).stroke)).toBe(colours.text);
    await expectNoHorizontalScroll(reader.page);
  }
  // The results in a real room, as the host and as the other member.
  await roomResults(reader, other);
  await giveUp(other.page); await giveUp(reader.page);
  for (const { page } of [reader, other]) {
    await expectResults(page);
    const colours = await system(page);
    expect(colours.text).not.toBe(colours.canvas);
    const cloths = page.locator("[data-pennant-cloth], [data-sail-cloth]");
    expect(await cloths.count()).toBeGreaterThanOrEqual(9);
    for (const cloth of await cloths.all()) expect(await cloth.evaluate((node) => getComputedStyle(node).fill)).toBe(colours.text);
    expect(await page.locator("[data-coast-edge]").evaluate((node) => getComputedStyle(node).stroke)).toBe(colours.text);
    // Kind still reads by shape, and the reader's row by its word, not by colour.
    await expect(page.getByRole("table").first().locator('svg[data-pennant="square"]')).toHaveCount(1);
    await expect(page.getByRole("table").first().locator('svg[data-pennant="triangle"]')).toHaveCount(2);
    await expect(page.getByRole("table").first().getByText(/\((toi|you)\)/)).toHaveCount(1);
    await expectNoHorizontalScroll(page);
  }
});

test("the results table is only ever set aside on a disposable local database", () => {
  // The database of this run is one.
  expect(isDisposableDatabase(process.env.E2E_DATABASE_URL ?? "")).toBe(true);
  expect(isDisposableDatabase("postgresql://u:p@localhost:5433/incision_e2e")).toBe(true);
  expect(isDisposableDatabase("postgresql://u:p@127.0.0.1:5432/incision_e2e_integration")).toBe(true);
  // Never the development, acceptance or production databases, wherever they are.
  for (const refused of [
    "",
    "not a url",
    "postgresql://u:p@localhost:5432/incision",
    "postgresql://u:p@localhost:5432/postgres",
    "postgresql://u:p@localhost:5432/incision_recette",
    "postgresql://u:p@localhost:5432/xincision_e2e",
    "postgresql://u:p@db.example.com:5432/incision_e2e",
    "postgresql://u:p@db.example.com:5432/incision_e2e?sslmode=require",
    // A `host` parameter must not make a remote server look local.
    "postgresql://u:p@localhost:5432/incision_e2e?host=db.example.com",
  ]) expect(isDisposableDatabase(refused), refused).toBe(false);
});
