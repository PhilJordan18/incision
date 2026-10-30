import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { EXCLUSIONS, FORBIDDEN_PAIRS, WORD_LISTS } from "@incision/domain/words";
import { expectNoAccessibilityViolation, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * F-03.1e (#45, CONF-03 to CONF-07): the host's text settings, shared with every member, kept on
 * reload and refused with the engine's translated reason. Whether random words can be saved depends
 * on the word data this build ships: the hand-written fixtures are refused (no fallback), reviewed
 * lists are served. The expectation is read from the same data, so the test is exact on any SHA.
 */
const APPROVED_WORDS = ![WORD_LISTS.fr, EXCLUSIONS.fr, FORBIDDEN_PAIRS.fr].some((data) => data.version.startsWith("fixture"));

const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function account(browser: Browser, name: string, locale = "fr-CA") {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [name]);
  if (row === undefined) throw new Error("Missing test account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" });
  contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return { context, page: await context.newPage() };
}
async function open(page: Page) {
  await page.goto("/rooms/new");
  await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  return page.url().split("/").at(-1) ?? "";
}
const panel = (page: Page) => page.getByRole("region", { name: /^(Réglages de la course|Race settings)$/ });
const summary = (page: Page, term: RegExp) => panel(page).locator("div", { has: page.locator("dt", { hasText: term }) }).locator("dd");
const saveButton = (page: Page) => panel(page).getByRole("button", { name: /^(Enregistrer les réglages|Save settings)$/ });

async function settingsRow(code: string) {
  const [row] = await query<{ text_kind: string; complexity: string; punctuation: boolean; numbers: boolean; capitals: boolean; accents: boolean; include_characters: string[]; exclude_characters: string[] }>(
    "select s.text_kind, s.complexity, s.punctuation, s.numbers, s.capitals, s.accents, s.include_characters, s.exclude_characters from lobby_settings s join lobbies l on l.id = s.lobby_id where l.code = $1", [code]);
  return row;
}

test("complexity and text options reach another member, survive reload and are frozen at the start", async ({ browser }) => {
  const { page: host } = await account(browser, "TextHost");
  const { page: member } = await account(browser, "TextMember");
  const code = await open(host);
  await member.goto(`/rooms/${code}`);
  await member.getByRole("button", { name: "Rejoindre la salle", exact: true }).click();
  await expect(member.getByText("[.En direct]", { exact: true })).toBeVisible();
  await expect(summary(member, /^Type de texte$/)).toHaveText("Passage cohérent");
  await expect(summary(member, /^Complexité$/)).toHaveText("Moyenne");

  await panel(host).getByRole("button", { name: "Modifier les réglages" }).click();
  await panel(host).getByRole("combobox", { name: "Complexité" }).selectOption("hard");
  // The options are toggle buttons, reachable and operable with the keyboard alone.
  const numbers = panel(host).getByRole("button", { name: "Chiffres" });
  await expect(numbers).toHaveAttribute("aria-pressed", "false");
  await numbers.focus();
  await numbers.press("Space");
  await expect(numbers).toHaveAttribute("aria-pressed", "true");
  const capitals = panel(host).getByRole("button", { name: "Majuscules" });
  await capitals.focus();
  await capitals.press("Enter");
  await expect(capitals).toHaveAttribute("aria-pressed", "false");
  // Coherent mode cannot take characters (D-10): both fields are disabled and say why.
  await expect(panel(host).getByRole("textbox", { name: "Caractères à inclure" })).toBeDisabled();
  await expect(panel(host).getByText(/Désactivé pour un passage cohérent/)).toBeVisible();
  await saveButton(host).click();
  await expect(panel(host).getByRole("status")).toHaveText("Réglages enregistrés.");

  await expect(summary(member, /^Complexité$/)).toHaveText("Difficile");
  await expect(summary(member, /^Options du texte$/)).toHaveText("ponctuation, chiffres, accents");
  await member.reload();
  await expect(summary(member, /^Complexité$/)).toHaveText("Difficile");
  expect(await settingsRow(code)).toEqual({ text_kind: "coherent", complexity: "hard", punctuation: true, numbers: true, capitals: false, accents: true, include_characters: [], exclude_characters: [] });

  await host.getByRole("button", { name: "Lancer la course", exact: true }).click();
  await expect(host.locator(".course-texte")).toBeVisible({ timeout: 10_000 });
  // Locked from the countdown to the results: the panel offers no change.
  await expect(panel(host).getByRole("button", { name: "Modifier les réglages" })).toHaveCount(0);
  if (process.env.E2E_SETTINGS_CORPUS !== undefined) {
    const [race] = await query<{ config: Record<string, unknown> }>("select config_snapshot as config from races r join lobbies l on l.current_race_id = r.id where l.code = $1", [code]);
    expect(race?.config.textSettings).toMatchObject({ kind: "coherent", complexity: "hard", options: { numbers: true, capitals: false } });
  }
});

for (const locale of ["fr-CA", "en-US"] as const) {
  test(`random words: characters, refusals before any request and the server's answer (${locale})`, async ({ browser }) => {
    const english = locale === "en-US";
    const { page } = await account(browser, `RandomHost${locale}`, locale);
    const code = await open(page);
    await panel(page).getByRole("button", { name: /^(Modifier les réglages|Edit settings)$/ }).click();
    await panel(page).getByRole("combobox", { name: /^(Type de texte|Text type)$/ }).selectOption("random");
    const include = panel(page).getByRole("textbox", { name: /^(Caractères à inclure|Characters to include)$/ });
    const exclude = panel(page).getByRole("textbox", { name: /^(Caractères à exclure|Characters to exclude)$/ });
    await expect(include).toBeEnabled();

    // The engine's data-free checks run in the browser: the same character both ways is refused, translated.
    await include.fill("k");
    await exclude.fill("K");
    await expect(panel(page).getByRole("alert")).toHaveText(english
      ? "⚠ The same character is both included and excluded (a parenthesis counts with its pair)."
      : "⚠ Un même caractère est à la fois inclus et exclu (une parenthèse compte avec sa paire).");
    await expect(saveButton(page)).toBeDisabled();
    await expect(include).toHaveAttribute("aria-invalid", "true");
    await expect(exclude).toHaveAttribute("aria-invalid", "true");
    // A digit needs the numbers option.
    await exclude.fill("");
    await include.fill("7");
    await expect(panel(page).getByRole("alert")).toContainText(english ? "needs an option that is off" : "dépend d’une option désactivée");
    await expect(saveButton(page)).toBeDisabled();

    await include.fill("kw");
    await exclude.fill("o");
    await expectNoAccessibilityViolation(page);
    await saveButton(page).click();
    if (APPROVED_WORDS) {
      await expect(panel(page).getByRole("status")).toHaveText(english ? "Settings saved." : "Réglages enregistrés.");
      await page.reload();
      await expect(summary(page, /^(Type de texte|Text type)$/)).toHaveText(english ? "Random words" : "Mots aléatoires");
      await expect(summary(page, /^(Caractères à inclure|Characters to include)$/)).toHaveText("k w");
      expect(await settingsRow(code)).toMatchObject({ text_kind: "random", include_characters: ["k", "w"], exclude_characters: ["o"] });
    } else {
      // Only the hand-written fixtures ship: random mode is refused, never served from them.
      await expect(panel(page).getByRole("alert")).toContainText(english ? "Random words are not available on this server yet." : "Les mots aléatoires ne sont pas encore disponibles sur ce serveur.");
      expect(await settingsRow(code)).toMatchObject({ text_kind: "coherent" });
    }
  });
}
