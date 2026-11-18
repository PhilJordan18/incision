import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { crew, expectResults, giveUp, roomResults, sailor, seedRace, setLocale, setTheme } from "./da2-results-fixture";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, query } from "./support";

/**
 * DA2-7: the C1 pieces on the screens after the race (results, race page, history, account),
 * checked on the running app. The functional assertions of these screens stay in their own specs.
 */
const contexts: BrowserContext[] = [];
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

test("room results: each pennant has its runner's shape, the reader's own has its track colour, no other claims one; host and non-host", async ({ browser }) => {
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
  await query("alter table race_results rename to race_results_away");
  try {
    await check("/history", async () => {
      await expect(page.getByRole("main").getByRole("alert")).toHaveText(fr ? "Ton historique est indisponible pour le moment." : "Your history is unavailable right now.");
    });
    await check("/account", async () => {
      await expect(page.getByRole("region", { name: fr ? "Tes statistiques" : "Your statistics" }).getByRole("alert")).toBeVisible();
      await expect(page.locator("[data-stat]")).toHaveCount(0);
    });
  } finally {
    await query("alter table race_results_away rename to race_results");
  }
});
