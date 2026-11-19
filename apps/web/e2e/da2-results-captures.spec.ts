import { mkdirSync } from "node:fs";
import path from "node:path";
import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import { crew, expectResults, giveUp, restoreResultsTable, roomResults, sailor, seedRace, setLocale, setResultsTableAside, setTheme } from "./da2-results-fixture";

/**
 * Evidence captures of the screens after the race (DA2-7), from the running app. Not a check:
 * runs only when DA2_CAPTURES names the output folder, e.g.
 * `DA2_CAPTURES=../../docs/evidence/da2-7-results-pages/after npx playwright test e2e/da2-results-captures.spec.ts`.
 */
const out = process.env.DA2_CAPTURES;
test.skip(out === undefined, "DA2_CAPTURES is not set");

const contexts: BrowserContext[] = [];
// A run cut short while the results table was set aside must not break the next one. Disposable test database only.
test.beforeAll(restoreResultsTable);
test.afterAll(restoreResultsTable);
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

const SIZES = {
  "1440": { width: 1440, height: 900 },
  "1024": { width: 1024, height: 768 },
  "390": { width: 390, height: 844 },
  "360": { width: 360, height: 780 },
  "1280x640": { width: 1280, height: 640 },
} as const;
type Size = keyof typeof SIZES;
type Theme = "abysse" | "aube";
type Shot = readonly [locale: "fr" | "en", theme: Theme, size: Size];

/** French in Abysse at every size, in Aube at 1440, 1024, 390 and the low screen; English once per theme. */
const MATRIX: readonly Shot[] = [
  ["fr", "abysse", "1440"], ["fr", "abysse", "1024"], ["fr", "abysse", "390"], ["fr", "abysse", "360"], ["fr", "abysse", "1280x640"],
  ["fr", "aube", "1440"], ["fr", "aube", "1024"], ["fr", "aube", "390"], ["fr", "aube", "1280x640"],
  ["en", "abysse", "1440"], ["en", "aube", "1440"],
];

async function shoot(page: Page, name: string): Promise<void> {
  mkdirSync(out!, { recursive: true });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(out!, `${name}.jpg`), type: "jpeg", quality: 72, fullPage: true });
}

async function matrix(page: Page, name: string, visit: () => Promise<void>, shots: readonly Shot[] = MATRIX): Promise<void> {
  for (const [locale, theme, size] of shots) {
    await setLocale(page.context(), locale); await setTheme(page.context(), theme);
    await page.setViewportSize(SIZES[size]);
    await visit();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await shoot(page, `${name}-${locale}-${theme}-${size}`);
  }
}

test("captures: results in the room, host and non-host", async ({ browser }) => {
  test.setTimeout(240_000);
  const host = await sailor(browser, "Capitaine"); const guest = await sailor(browser, "Lina");
  contexts.push(host.context, guest.context);
  await roomResults(host, guest);
  await giveUp(guest.page); await giveUp(host.page);
  await expectResults(host.page); await expectResults(guest.page);
  const open = async (page: Page) => {
    await page.reload(); await expectResults(page);
    const journal = page.getByRole("region", { name: /^(Journal des bonus|Bonus journal)$/ });
    await journal.locator("summary").first().click();
  };
  await matrix(host.page, "room-results-host", () => open(host.page));
  await matrix(guest.page, "room-results-non-host", () => open(guest.page),
    [["fr", "abysse", "1440"], ["fr", "aube", "1440"], ["fr", "abysse", "390"], ["en", "abysse", "1440"]]);
});

test("captures: race page", async ({ browser }) => {
  test.setTimeout(240_000);
  const reader = await sailor(browser, "Capitaine"); const other = await sailor(browser, "Lina");
  contexts.push(reader.context, other.context);
  const race = await seedRace(crew(reader.accountId, other.accountId), { round: 3 });
  const open = async () => {
    await reader.page.goto(`/races/${race.id}`);
    await reader.page.getByRole("region", { name: /^(Journal des bonus|Bonus journal)$/ }).locator("summary").nth(1).click();
  };
  await matrix(reader.page, "race-page", open);
  // Forced colours (Windows contrast themes): set on the context, so the browser really repaints
  // the page with the system palette. Light palette only: headless Chromium does not paint a dark
  // forced palette faithfully (the page keeps its authored colours), so that one is not evidence.
  for (const scheme of ["light"] as const) {
    const forced = await browser.newContext({ viewport: SIZES["1440"], locale: "fr-CA", reducedMotion: "reduce", forcedColors: "active", colorScheme: scheme });
    contexts.push(forced);
    await forced.addCookies(await reader.context.cookies());
    await setLocale(forced, "fr"); await setTheme(forced, "aube");
    const page = await forced.newPage();
    await page.goto(`/races/${race.id}`);
    await shoot(page, `race-page-forced-colors-${scheme}`);
    await page.goto("/account");
    await shoot(page, `account-forced-colors-${scheme}`);
  }
  // 200 % zoom of a 1440 px window: 720 CSS px at twice the density.
  const zoomed = await browser.newContext({ viewport: { width: 720, height: 450 }, deviceScaleFactor: 2, locale: "fr-CA", reducedMotion: "reduce" });
  contexts.push(zoomed);
  await zoomed.addCookies(await reader.context.cookies());
  const page = await zoomed.newPage();
  for (const theme of ["abysse", "aube"] as const) {
    await setTheme(zoomed, theme);
    await page.goto(`/races/${race.id}`);
    await shoot(page, `race-page-zoom-200-${theme}`);
  }
});

test("captures: history and account", async ({ browser }) => {
  test.setTimeout(240_000);
  const reader = await sailor(browser, "Capitaine"); const other = await sailor(browser, "Lina");
  contexts.push(reader.context, other.context);
  const { page } = reader;
  await matrix(page, "history-empty", async () => { await page.goto("/history"); },
    [["fr", "abysse", "1440"], ["fr", "aube", "1440"], ["fr", "aube", "390"], ["en", "aube", "1440"]]);
  await matrix(page, "account-empty", async () => { await page.goto("/account"); },
    [["fr", "abysse", "1440"], ["fr", "aube", "1440"]]);
  for (let round = 1; round <= 5; round++) {
    await seedRace(crew(reader.accountId, other.accountId), { round, endedAt: `2026-11-1${round}T19:0${round}:00Z` });
  }
  await matrix(page, "history", async () => { await page.goto("/history"); });
  await matrix(page, "history-invalid", async () => { await page.goto("/history?cursor=a&cursor=b"); },
    [["fr", "abysse", "1440"], ["fr", "aube", "1440"], ["fr", "aube", "390"]]);
  await matrix(page, "account", async () => {
    await page.goto("/account");
    await page.locator("#profile-progression").locator("xpath=..").locator("summary").click();
  });
  // A name the server refuses: the invalid field and its message.
  await matrix(page, "account-name-invalid", async () => {
    await page.goto("/account");
    await page.getByLabel(/^(Nom d’affichage|Display name)$/).fill("   ");
    await page.getByRole("button", { name: /^(Enregistrer le nom|Save display name)$/ }).click();
    await expect(page.locator("#display-name-error")).toBeVisible();
  }, [["fr", "abysse", "1440"], ["fr", "aube", "1440"], ["fr", "aube", "390"]]);
  // The unavailable cards: the results table is out of reach on this disposable database only.
  await setResultsTableAside();
  try {
    await matrix(page, "history-unavailable", async () => { await page.goto("/history"); },
      [["fr", "abysse", "1440"], ["fr", "aube", "1440"], ["fr", "aube", "390"]]);
    await matrix(page, "account-statistics-unavailable", async () => { await page.goto("/account"); },
      [["fr", "abysse", "1440"], ["fr", "aube", "1440"], ["fr", "aube", "390"]]);
  } finally {
    await restoreResultsTable();
  }
});
