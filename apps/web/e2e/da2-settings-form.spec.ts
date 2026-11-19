import { type Browser, type BrowserContext, expect, type Locator, type Page, test, type WebSocketRoute } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

// DA2-8 (CONF-01 to CONF-09, CONF-12, A11Y-03, A11Y-04): the race settings edit form in four
// groups, what is saved against what is pending, errors beside their field, and a draft that a
// realtime update never overwrites. Rules and defaults are those of room-settings.spec.ts,
// text-settings.spec.ts and arcade-settings.spec.ts, which pass unchanged.
const EVIDENCE = process.env.DA2_EVIDENCE === "1" ? "../../docs/evidence/da2-8-settings-form" : undefined;
const LIVE = /^\[\.(En direct|Live)\]$/;
type Theme = "abysse" | "aube";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id = null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

/**
 * The emulated network loss does not close an open WebSocket: a page would only notice at a missed
 * heartbeat, many seconds later. Each page's room socket goes through the test, which can cut it.
 */
const sockets = new WeakMap<Page, WebSocketRoute[]>();
async function goOffline(context: BrowserContext, page: Page): Promise<void> {
  await context.setOffline(true);
  await Promise.all((sockets.get(page) ?? []).splice(0).map((socket) => socket.close()));
}

async function account(browser: Browser, name: string, options: { locale?: string; theme?: Theme; forcedColors?: boolean } = {}) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ($1) returning id, session_version", [name]);
  if (!row) throw new Error("fixture account");
  const context = await browser.newContext({ locale: options.locale ?? "fr-CA", reducedMotion: "reduce", viewport: { width: 1440, height: 900 }, forcedColors: options.forcedColors === true ? "active" : "none" });
  contexts.push(context);
  const url = test.info().project.use.baseURL ?? "";
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url }, { name: "theme", value: options.theme ?? "abysse", url }]);
  const page = await context.newPage();
  const routed: WebSocketRoute[] = [];
  sockets.set(page, routed);
  await page.routeWebSocket(/\/socket\.io\//, (socket) => { socket.connectToServer(); routed.push(socket); });
  return { context, page };
}
async function openRoom(host: Page): Promise<string> {
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(host.getByText(LIVE)).toBeVisible();
  return host.url().split("/").at(-1) ?? "";
}
async function join(member: Page, code: string): Promise<void> {
  await member.goto(`/rooms/${code}`);
  await member.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
  await expect(member.getByText(LIVE)).toBeVisible();
}

const panel = (page: Page) => page.getByRole("region", { name: /^(Réglages de la course|Race settings)$/ });
const editButton = (page: Page) => panel(page).getByRole("button", { name: /^(Modifier les réglages|Edit settings)$/ });
const saveButton = (page: Page) => panel(page).getByRole("button", { name: /^(Enregistrer les réglages|Save settings)$/ });
const cancelButton = (page: Page) => panel(page).getByRole("button", { name: /^(Annuler|Cancel)$/ });
const groupOf = (page: Page, name: RegExp) => panel(page).getByRole("group", { name });
const summary = (page: Page, term: RegExp) => panel(page).locator("div", { has: page.locator("dt", { hasText: term }) }).locator("dd");
const language = (page: Page) => panel(page).getByRole("combobox", { name: /^(Langue du texte|Text language)/ });
const words = (page: Page) => panel(page).getByRole("spinbutton", { name: /^(Nombre de mots|Word count)/ });
const seconds = (page: Page) => panel(page).getByRole("spinbutton", { name: /^(Durée maximale|Time limit)/ });
const unlimited = (page: Page) => panel(page).getByRole("checkbox", { name: /^(Aucune limite|No limit)$/ });
/** The live sentence counting the pending changes. */
const pendingCount = (page: Page) => panel(page).locator("[data-pending-count]");
/** The pending mark of one field: its tag and the saved value in words. */
const mark = (page: Page, field: string) => panel(page).locator(`[data-pending="${field}"]`);

async function savedRow(code: string) {
  const [row] = await query<{ text_language: string; word_count: number; time_limit_ms: number | null; error_mode: string; bonuses_enabled: boolean; text_kind: string }>(
    "select s.text_language, s.word_count, s.time_limit_ms, s.error_mode, s.bonuses_enabled, s.text_kind from lobby_settings s join lobbies l on l.id = s.lobby_id where l.code = $1", [code]);
  return row;
}
/** The description of a control, as a screen reader reads it after the name. */
async function describedBy(control: Locator): Promise<string> {
  return control.evaluate((element) => (element.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? `missing:${id}`).join(" | "));
}
async function below(lower: Locator, upper: Locator): Promise<void> {
  const [a, b] = [await lower.boundingBox(), await upper.boundingBox()];
  if (!a || !b) throw new Error("not rendered");
  expect(a.y).toBeGreaterThanOrEqual(b.y + b.height - 1);
}

test("the settings come second, before the bots, and the form has four groups with visible legends", async ({ browser }) => {
  const { page } = await account(browser, "Capitaine");
  await openRoom(page);
  const regions = await page.getByRole("main").getByRole("region").evaluateAll((elements) => elements.map((element) => document.getElementById(element.getAttribute("aria-labelledby") ?? "")?.textContent ?? ""));
  expect(regions.slice(0, 2)).toEqual(["Code de la salle", "Réglages de la course"]);
  expect(regions.indexOf("Réglages de la course")).toBeLessThan(regions.indexOf("Bots"));
  await expect(editButton(page)).toHaveAttribute("aria-expanded", "false");
  await editButton(page).click();
  await expect(editButton(page)).toHaveAttribute("aria-expanded", "true");
  await expect(language(page)).toBeFocused();
  // Four groups, each a fieldset with its legend on screen, in this order.
  const legends = panel(page).locator("fieldset fieldset > legend:not(.sr-only)");
  await expect(legends).toHaveText(["Texte", "Options du texte", "Durée", "Mode de frappe", "Mode de jeu"]);
  for (const legend of await legends.all()) await expect(legend).toBeVisible();
  // Every existing field sits in its group.
  const text = groupOf(page, /^Texte$/);
  for (const name of [/^Langue du texte/, /^Type de texte$/, /^Complexité$/]) await expect(text.getByRole("combobox", { name })).toBeVisible();
  await expect(text.getByRole("spinbutton", { name: /^Nombre de mots/ })).toBeVisible();
  await expect(text.getByRole("group", { name: "Options du texte" }).getByRole("button")).toHaveText(["○Ponctuation", "○Chiffres", "○Majuscules", "○Accents"].map((label, index) => [0, 2, 3].includes(index) ? label.replace("○", "✓") : label));
  for (const name of ["Caractères à inclure", "Caractères à exclure"]) await expect(text.getByRole("textbox", { name, exact: true })).toBeDisabled();
  const duration = groupOf(page, /^Durée$/);
  await expect(duration.getByRole("checkbox", { name: "Aucune limite" })).toBeChecked();
  await expect(duration.getByRole("spinbutton", { name: /^Durée maximale/ })).toBeDisabled();
  await expect(groupOf(page, /^Mode de frappe$/).getByRole("combobox", { name: "Mode de frappe", exact: true })).toHaveValue("mandatory");
  await expect(groupOf(page, /^Mode de jeu$/).getByRole("combobox", { name: "Mode de jeu", exact: true })).toHaveValue("training");
  // Every hint is kept.
  for (const hint of [/De 10 à 200 mots/, /Un passage du domaine public/, /Le niveau d’un passage est choisi/, /Désactivé pour un passage cohérent/, /Correction obligatoire : corrige chaque erreur/, /Arcade : les coureurs en retard/, /Aucune limite, ou de 30 à 600 secondes/]) {
    await expect(panel(page).getByText(hint)).toBeVisible();
  }
  // The saved summary stays on screen above the open form.
  await expect(summary(page, /^Langue du texte$/)).toBeVisible();
  await below(text, panel(page).locator("dl"));
  await expect(pendingCount(page)).toHaveText("Aucune modification en attente.");
  await expectNoAccessibilityViolation(page);
});

for (const locale of ["fr-CA", "en-US"] as const) {
  test(`a pending change is marked per field with the saved value in words, and nothing saves by itself (${locale})`, async ({ browser }) => {
    const fr = locale === "fr-CA";
    const { page } = await account(browser, "Capitaine", { locale });
    const code = await openRoom(page);
    await editButton(page).click();
    await expect(panel(page).locator("[data-pending]")).toHaveCount(0);
    // The room's text language is its creator's (D-19): the change under test is the other one.
    const initial = await savedRow(code);
    const savedLanguage = initial?.text_language === "fr" ? (fr ? "Français" : "French") : (fr ? "Anglais" : "English");
    await language(page).selectOption(initial?.text_language === "fr" ? "en" : "fr");
    await expect(mark(page, "textLanguage")).toHaveText(fr ? `⚠Non enregistréEnregistré : ${savedLanguage}` : `⚠UnsavedSaved: ${savedLanguage}`);
    await expect(pendingCount(page)).toHaveText(fr ? "⚠ 1 modification en attente." : "⚠ 1 pending change.");
    // Read with the field: its description carries the tag and the saved value.
    expect(await describedBy(language(page))).toContain(fr ? `Enregistré : ${savedLanguage}` : `Saved: ${savedLanguage}`);
    await words(page).fill("60");
    await unlimited(page).uncheck();
    await seconds(page).fill("120");
    await panel(page).getByRole("button", { name: fr ? "Chiffres" : "Numbers" }).click();
    await panel(page).getByRole("combobox", { name: fr ? "Mode de frappe" : "Typing mode", exact: true }).selectOption("free");
    await panel(page).getByRole("combobox", { name: fr ? "Mode de jeu" : "Game mode", exact: true }).selectOption("arcade");
    await expect(mark(page, "wordCount")).toContainText(fr ? "Enregistré : 50" : "Saved: 50");
    await expect(mark(page, "seconds")).toContainText(fr ? "Enregistré : Aucune limite" : "Saved: No limit");
    await expect(mark(page, "options")).toContainText(fr ? "Enregistré : ponctuation, majuscules, accents" : "Saved: punctuation, capitals, accents");
    await expect(mark(page, "errorMode")).toContainText(fr ? "Enregistré : Correction obligatoire" : "Saved: Mandatory correction");
    await expect(mark(page, "bonusesEnabled")).toContainText(fr ? "Enregistré : Entraînement" : "Saved: Training");
    await expect(pendingCount(page)).toHaveText(fr ? "⚠ 6 modifications en attente." : "⚠ 6 pending changes.");
    await expect(panel(page).locator("[data-pending]")).toHaveCount(6);
    // Each mark sits in the group of its field.
    await expect(groupOf(page, fr ? /^Durée$/ : /^Duration$/).locator("[data-pending]")).toHaveCount(1);
    await expect(groupOf(page, fr ? /^Texte$/ : /^Text$/).locator("[data-pending]")).toHaveCount(3);
    // The summary is the saved one, not the draft (no optimistic value); the database too.
    await expect(summary(page, fr ? /^Langue du texte$/ : /^Text language$/)).toHaveText(savedLanguage);
    await expect(summary(page, fr ? /^Nombre de mots$/ : /^Word count$/)).toHaveText("50");
    // Back to the saved value: the mark goes, the count follows.
    await language(page).selectOption(initial?.text_language ?? "fr");
    await expect(mark(page, "textLanguage")).toHaveCount(0);
    await expect(pendingCount(page)).toHaveText(fr ? "⚠ 5 modifications en attente." : "⚠ 5 pending changes.");
    expect(await savedRow(code)).toEqual({ text_language: initial?.text_language, word_count: 50, time_limit_ms: null, error_mode: "mandatory", bonuses_enabled: false, text_kind: "coherent" });
    await expectNoAccessibilityViolation(page);
    // « Annuler » restores the saved values and gives the focus back.
    await cancelButton(page).click();
    await expect(editButton(page)).toBeFocused();
    await expect(panel(page).locator("form")).toHaveCount(0);
    await editButton(page).click();
    await expect(words(page)).toHaveValue("50");
    await expect(unlimited(page)).toBeChecked();
    await expect(pendingCount(page)).toHaveText(fr ? "Aucune modification en attente." : "No pending changes.");
    expect(await savedRow(code)).toEqual({ text_language: initial?.text_language, word_count: 50, time_limit_ms: null, error_mode: "mandatory", bonuses_enabled: false, text_kind: "coherent" });
    // An explicit save sends the draft; the summary then shows it and the form closes.
    await words(page).fill("60");
    await saveButton(page).click();
    await expect(panel(page).getByRole("status")).toHaveText(fr ? "Réglages enregistrés." : "Settings saved.");
    await expect(summary(page, fr ? /^Nombre de mots$/ : /^Word count$/)).toHaveText("60");
    await expect(editButton(page)).toBeFocused();
    expect((await savedRow(code))?.word_count).toBe(60);
  });
}

test("word count and duration errors sit beside their field, linked and marked invalid", async ({ browser }) => {
  const { page } = await account(browser, "Capitaine");
  await openRoom(page);
  await editButton(page).click();
  for (const invalid of ["9", "201", ""]) {
    await words(page).fill(invalid);
    await expect(words(page)).toHaveAttribute("aria-invalid", "true");
    expect(await describedBy(words(page)), `word count « ${invalid} »`).toContain("Choisis de 10 à 200 mots.");
    await expect(saveButton(page)).toBeDisabled();
  }
  const wordsError = groupOf(page, /^Texte$/).getByText("Choisis de 10 à 200 mots.");
  await expect(wordsError).toHaveCount(1);
  await below(wordsError, words(page));
  await unlimited(page).uncheck();
  for (const invalid of ["29", "601", ""]) {
    await seconds(page).fill(invalid);
    await expect(seconds(page)).toHaveAttribute("aria-invalid", "true");
    expect(await describedBy(seconds(page)), `duration « ${invalid} »`).toContain("Choisis « Aucune limite » ou une durée entière de 30 à 600 secondes.");
  }
  const durationError = groupOf(page, /^Durée$/).getByText(/Choisis « Aucune limite » ou une durée entière/);
  await below(durationError, seconds(page));
  // Never by colour alone: a sign, words and a thicker border.
  await expect(durationError.locator("..")).toContainText("⚠");
  await expect(seconds(page)).toHaveCSS("border-top-width", "2px");
  await expect(saveButton(page)).toBeDisabled();
  await expectNoAccessibilityViolation(page);
  await words(page).fill("50");
  await seconds(page).fill("45");
  for (const field of [words(page), seconds(page)]) await expect(field).not.toHaveAttribute("aria-invalid", "true");
  await expect(panel(page).getByText(/Choisis de 10 à 200 mots\.|durée entière/)).toHaveCount(0);
  await expect(saveButton(page)).toBeEnabled();
});

test("character refusals stay on both character fields; the options point to the message that concerns them", async ({ browser }) => {
  const { page } = await account(browser, "Capitaine");
  await openRoom(page);
  await editButton(page).click();
  await panel(page).getByRole("combobox", { name: "Type de texte", exact: true }).selectOption("random");
  const include = panel(page).getByRole("textbox", { name: "Caractères à inclure", exact: true });
  const exclude = panel(page).getByRole("textbox", { name: "Caractères à exclure", exact: true });
  await include.fill("7");
  const alert = panel(page).getByRole("alert");
  await expect(alert).toHaveText("⚠ Un caractère inclus dépend d’une option désactivée (chiffres, ponctuation ou accents).");
  for (const field of [include, exclude]) {
    await expect(field).toHaveAttribute("aria-invalid", "true");
    expect(await describedBy(field)).toContain("dépend d’une option désactivée");
  }
  await below(alert, include);
  expect(await describedBy(panel(page).getByRole("button", { name: "Chiffres" }))).toContain("dépend d’une option désactivée");
  await expect(groupOf(page, /^Texte$/).getByRole("alert")).toHaveCount(1);
  await expectNoAccessibilityViolation(page);
  await panel(page).getByRole("button", { name: "Chiffres" }).click();
  await expect(alert).toHaveCount(0);
  await expect(include).toHaveAttribute("aria-invalid", "false");
});

test("a refused save shows beside the field it concerns, keeps the draft and moves the focus there", async ({ browser }) => {
  const { page } = await account(browser, "Capitaine");
  const code = await openRoom(page);
  await editButton(page).click();
  // Settings no reviewed word list can serve (and, on a build with fixture lists only, random words themselves).
  await panel(page).getByRole("combobox", { name: "Type de texte", exact: true }).selectOption("random");
  await panel(page).getByRole("combobox", { name: "Complexité", exact: true }).selectOption("easy");
  for (const option of ["Ponctuation", "Majuscules", "Accents"]) await panel(page).getByRole("button", { name: option }).click();
  await panel(page).getByRole("textbox", { name: "Caractères à exclure", exact: true }).fill("aeiouybcdfglmnprst");
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
  await saveButton(page).click();
  const alert = panel(page).getByRole("alert");
  await expect(alert).toContainText("Ces réglages de texte ne peuvent pas produire de texte.");
  // One message, inside the text group, beside the first field it names; that field has the focus.
  await expect(groupOf(page, /^Texte$/).getByRole("alert")).toHaveCount(1);
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("aria-invalid", "true");
  expect(await describedBy(focused)).toContain("Ces réglages de texte ne peuvent pas produire de texte.");
  await below(alert, focused);
  const unavailable = (await alert.textContent() ?? "").includes("pas encore disponibles");
  await expect(focused).toHaveAccessibleName(unavailable ? "Type de texte" : "Complexité");
  // The draft is kept, nothing was saved, and another try stays possible.
  await expect(panel(page).getByRole("textbox", { name: "Caractères à exclure", exact: true })).toHaveValue("aeiouybcdfglmnprst");
  expect((await savedRow(code))?.text_kind).toBe("coherent");
  await expect(saveButton(page)).toBeEnabled();
  await expectNoAccessibilityViolation(page);
  // The refusal speaks of the fields it names. Another field can change under it…
  await panel(page).getByRole("combobox", { name: "Mode de jeu", exact: true }).selectOption("arcade");
  await expect(alert).toContainText("Ces réglages de texte ne peuvent pas produire de texte.");
  if (!unavailable) {
    // …a field it names removes it, and the refused value brings it back.
    await panel(page).getByRole("combobox", { name: "Complexité", exact: true }).selectOption("hard");
    await expect(panel(page).getByRole("alert")).toHaveCount(0);
    await expect(panel(page).getByRole("combobox", { name: "Complexité", exact: true })).not.toHaveAttribute("aria-invalid", "true");
    await panel(page).getByRole("combobox", { name: "Complexité", exact: true }).selectOption("easy");
    await expect(alert).toContainText("Ces réglages de texte ne peuvent pas produire de texte.");
  }
  // It never comes back as a panel message once the draft no longer matches.
  await panel(page).getByRole("combobox", { name: "Type de texte", exact: true }).selectOption("coherent");
  await panel(page).getByRole("combobox", { name: "Complexité", exact: true }).selectOption("medium");
  await expect(panel(page).getByRole("alert")).toHaveCount(0);
  await expect(mark(page, "bonusesEnabled")).toBeVisible();
});

test("a refusal that concerns no single field stays in the form's alert and the focus stays on the save", async ({ browser }) => {
  test.setTimeout(120_000);
  const { page } = await account(browser, "Capitaine");
  await openRoom(page);
  // The settings budget (30 saves a minute, refused ones included) is this account's own.
  let refused = false;
  for (let attempt = 0; attempt < 32 && !refused; attempt++) {
    await editButton(page).click();
    await words(page).fill(String(20 + attempt));
    await saveButton(page).click();
    // Either the save is confirmed in the room (the form closed and « Modifier » works again), or it was refused.
    const confirmed = panel(page).getByText("Réglages enregistrés.", { exact: true });
    const alert = panel(page).getByRole("alert");
    await expect(confirmed.or(alert)).toBeVisible();
    refused = await alert.isVisible();
    if (!refused) await expect(editButton(page)).toHaveAttribute("aria-disabled", "false");
  }
  expect(refused).toBe(true);
  await expect(panel(page).getByRole("alert")).toHaveText("⚠ Trop de modifications. Attends une minute avant de réessayer.");
  await expect(panel(page).locator("fieldset").getByRole("alert")).toHaveCount(0);
  await expect(saveButton(page)).toBeFocused();
  await expect(words(page)).not.toHaveAttribute("aria-invalid", "true");
  await expect(mark(page, "wordCount")).toBeVisible();
});

test("a concurrent save updates the summary, shows the conflict and never overwrites the draft", async ({ browser }) => {
  const { page: first, context } = await account(browser, "Capitaine");
  const { page: member } = await account(browser, "Lina");
  const code = await openRoom(first);
  await join(member, code);
  const second = await context.newPage();
  await second.goto(`/rooms/${code}`);
  await expect(second.getByText(LIVE)).toBeVisible();
  await editButton(first).click();
  await unlimited(first).uncheck();
  await seconds(first).fill("45");
  await words(first).fill("80");
  // A room update that does not touch the settings (a bot is added) leaves the form as it is.
  await second.getByRole("region", { name: "Bots", exact: true }).getByRole("button", { name: "Ajouter un bot" }).click();
  await expect(first.getByRole("region", { name: "Bots", exact: true }).getByRole("listitem")).toHaveCount(1);
  await expect(panel(first).getByRole("alert")).toHaveCount(0);
  await expect(seconds(first)).toHaveValue("45");
  await expect(saveButton(first)).toBeEnabled();
  // The same host saves other settings from a second browser tab.
  await editButton(second).click();
  await unlimited(second).uncheck();
  await seconds(second).fill("90");
  await language(second).selectOption("en");
  await saveButton(second).click();
  await expect(panel(second).getByRole("status")).toHaveText("Réglages enregistrés.");
  // First tab: the summary is the new saved one, the existing conflict message shows, the draft stays.
  await expect(summary(first, /^Durée maximale/)).toHaveText("90");
  await expect(summary(first, /^Langue du texte$/)).toHaveText("Anglais");
  await expect(panel(first).getByRole("alert")).toHaveText("⚠ Les réglages ont changé dans un autre onglet. Ton brouillon est conservé. Recharge les réglages avant de modifier à nouveau.");
  await expect(seconds(first)).toHaveValue("45");
  await expect(words(first)).toHaveValue("80");
  await expect(language(first)).toHaveValue("fr");
  // What is pending is told against the new saved values.
  await expect(mark(first, "seconds")).toContainText("Enregistré : 90 s");
  await expect(mark(first, "textLanguage")).toContainText("Enregistré : Anglais");
  await expect(pendingCount(first)).toHaveText("⚠ 3 modifications en attente.");
  await expect(saveButton(first)).toBeDisabled();
  await expect(seconds(first)).toBeDisabled();
  // The non-host reads the synchronised summary, and only that.
  await expect(summary(member, /^Durée maximale/)).toHaveText("90");
  await expect(panel(member).getByRole("button")).toHaveCount(0);
  await expect(panel(member).locator("form")).toHaveCount(0);
  // Later updates still do not touch the draft; « Recharger les réglages » is the only way to replace it.
  await second.getByRole("region", { name: "Bots", exact: true }).getByRole("button", { name: "Ajouter un bot" }).click();
  await expect(first.getByRole("region", { name: "Bots", exact: true }).getByRole("listitem")).toHaveCount(2);
  await expect(seconds(first)).toHaveValue("45");
  await expectNoAccessibilityViolation(first);
  await panel(first).getByRole("button", { name: "Recharger les réglages" }).click();
  await expect(panel(first).locator("form")).toHaveCount(0);
  await expect(editButton(first)).toBeFocused();
  await expect(first.getByText(LIVE)).toBeVisible();
  await editButton(first).click();
  await expect(seconds(first)).toHaveValue("90");
  await expect(pendingCount(first)).toHaveText("Aucune modification en attente.");
  expect(await savedRow(code)).toMatchObject({ text_language: "en", time_limit_ms: 90_000, word_count: 50 });
});

test("a disconnected host keeps the draft and cannot edit until the room is live again", async ({ browser }) => {
  const { page, context } = await account(browser, "Capitaine");
  await openRoom(page);
  await editButton(page).click();
  await words(page).fill("70");
  await goOffline(context, page);
  await expect(panel(page).getByText("Attends la reconnexion avant de modifier les réglages.")).toBeVisible({ timeout: 30_000 });
  await expect(words(page)).toBeDisabled();
  await expect(words(page)).toHaveValue("70");
  await expect(saveButton(page)).toBeDisabled();
  await expect(mark(page, "wordCount")).toContainText("Enregistré : 50");
  await expect(summary(page, /^Nombre de mots$/)).toHaveText("50");
  await context.setOffline(false);
  await expect(page.getByText(LIVE)).toBeVisible({ timeout: 30_000 });
  await expect(words(page)).toBeEnabled();
  await expect(words(page)).toHaveValue("70");
  await expect(saveButton(page)).toBeEnabled();
});

test("the form is fully usable with the keyboard, in the groups' order", async ({ browser }) => {
  const { page } = await account(browser, "Capitaine");
  await openRoom(page);
  await editButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(language(page)).toBeFocused();
  const order: string[] = [];
  for (let stop = 0; stop < 12; stop++) {
    await page.keyboard.press("Tab");
    order.push(await page.locator(":focus").evaluate((element) => [...((element as HTMLInputElement).labels?.[0]?.childNodes ?? [])].find((node) => node.nodeType === Node.TEXT_NODE)?.textContent ?? element.textContent ?? ""));
  }
  // Disabled fields (characters while coherent, seconds while unlimited) are skipped.
  expect(order).toEqual(["Type de texte", "Complexité", "Nombre de mots", "✓Ponctuation", "○Chiffres", "✓Majuscules", "✓Accents", "Aucune limite", "Mode de frappe", "Mode de jeu", "Enregistrer les réglages", "Annuler"]);
  await page.keyboard.press("Escape");
  await expect(editButton(page)).toBeFocused();
  await expect(panel(page).locator("form")).toHaveCount(0);
});

/** One capture of the panel alone: the state is the subject, and the files stay small. */
async function capture(page: Page, name: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expectNoHorizontalScroll(page);
    await panel(page).screenshot({ path: EVIDENCE === undefined ? test.info().outputPath(`${name}-${width}.jpg`) : `${EVIDENCE}/${name}-${width}.jpg`, type: "jpeg", quality: 72 });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

for (const locale of ["fr-CA", "en-US"] as const) for (const theme of ["abysse", "aube"] as const) {
  test(`every state of the settings panel, accessible at 1440 and 390 px (${locale}, ${theme})`, async ({ browser }) => {
    // Two combinations always run (each language, each theme); the two others only add captures.
    test.skip(EVIDENCE === undefined && (locale === "fr-CA") !== (theme === "abysse"), "capture-only combination: run with DA2_EVIDENCE=1");
    test.setTimeout(120_000);
    const fr = locale === "fr-CA";
    const tag = `${fr ? "fr" : "en"}-${theme}`;
    const { page: host, context } = await account(browser, "Capitaine", { locale, theme });
    const { page: member } = await account(browser, "Lina", { locale, theme });
    const code = await openRoom(host);
    await join(member, code);
    await expect(host.locator("html")).toHaveAttribute("data-theme", theme);
    const check = async (page: Page, state: string) => { await expectNoAccessibilityViolation(page); await capture(page, `${state}-${tag}`); };
    await check(host, "1-ferme");
    await check(member, "8-non-hote");
    await editButton(host).click();
    await host.locator("body").click({ position: { x: 2, y: 2 } }); // no focus ring in the capture of the clean form
    await check(host, "2-ouvert-sans-modification");
    await language(host).selectOption(await language(host).inputValue() === "fr" ? "en" : "fr");
    await words(host).fill("60");
    await panel(host).getByRole("button", { name: fr ? "Chiffres" : "Numbers" }).click();
    await panel(host).getByRole("combobox", { name: fr ? "Mode de jeu" : "Game mode", exact: true }).selectOption("arcade");
    await expect(pendingCount(host)).toContainText("4");
    await check(host, "3-modifications-en-attente");
    await words(host).fill("9");
    await unlimited(host).uncheck();
    await seconds(host).fill("29");
    await expect(seconds(host)).toHaveAttribute("aria-invalid", "true");
    await check(host, "4-erreur-de-champ");
    await cancelButton(host).click();
    // Server refusal: settings the word lists cannot serve.
    await editButton(host).click();
    await panel(host).getByRole("combobox", { name: fr ? "Type de texte" : "Text type", exact: true }).selectOption("random");
    await panel(host).getByRole("combobox", { name: fr ? "Complexité" : "Complexity", exact: true }).selectOption("easy");
    for (const option of fr ? ["Ponctuation", "Majuscules", "Accents"] : ["Punctuation", "Capitals", "Accents"]) await panel(host).getByRole("button", { name: option }).click();
    await panel(host).getByRole("textbox", { name: fr ? "Caractères à exclure" : "Characters to exclude", exact: true }).fill("aeiouybcdfglmnprst");
    await saveButton(host).click();
    await expect(panel(host).getByRole("alert")).toContainText(fr ? "ne peuvent pas produire de texte" : "cannot produce a text");
    await check(host, "5-refus-du-serveur");
    await cancelButton(host).click();
    // Conflict: the same host saves from a second tab while this draft is open.
    await editButton(host).click();
    await words(host).fill("80");
    const second = await context.newPage();
    await second.goto(`/rooms/${code}`);
    await expect(second.getByText(LIVE)).toBeVisible();
    await editButton(second).click();
    await language(second).selectOption(await language(second).inputValue() === "fr" ? "en" : "fr");
    await saveButton(second).click();
    await expect(panel(second).getByRole("status")).toBeVisible();
    await second.close();
    await expect(panel(host).getByRole("alert")).toContainText(fr ? "autre onglet" : "another tab");
    await check(host, "6-conflit");
    await panel(host).getByRole("button", { name: fr ? "Recharger les réglages" : "Reload settings" }).click();
    await expect(host.getByText(LIVE)).toBeVisible();
    // Disconnected, with a draft open.
    await editButton(host).click();
    await words(host).fill("70");
    await goOffline(context, host);
    await expect(panel(host).getByText(fr ? "Attends la reconnexion avant de modifier les réglages." : "Wait for reconnection before editing settings.")).toBeVisible({ timeout: 30_000 });
    await check(host, "7-deconnecte");
    await context.setOffline(false);
  });
}

test("a refusal that asks to read the settings again gives the focus to « Recharger les réglages »", async ({ browser }) => {
  const { page } = await account(browser, "Capitaine");
  const code = await openRoom(page);
  await editButton(page).click();
  await words(page).fill("70");
  // Fixture: the settings moved on without telling this page, so its revision is stale.
  await query("update lobby_settings set revision = revision + 1 where lobby_id = (select id from lobbies where code = $1)", [code]);
  await saveButton(page).click();
  await expect(panel(page).getByRole("alert").filter({ hasText: "Les réglages ont changé." })).toBeVisible();
  const reload = panel(page).getByRole("button", { name: "Recharger les réglages" });
  await expect(reload).toBeFocused();
  // The draft is kept and nothing more can be sent until the read.
  await expect(words(page)).toHaveValue("70");
  await expect(words(page)).toBeDisabled();
  await expect(saveButton(page)).toBeDisabled();
  expect((await savedRow(code))?.word_count).toBe(50);
  await page.keyboard.press("Enter");
  await expect(panel(page).locator("form")).toHaveCount(0);
  await expect(editButton(page)).toBeFocused();
});

test("the start of the race ends the edit without saving the draft", async ({ browser }) => {
  const { page: host, context } = await account(browser, "Capitaine");
  const { page: member } = await account(browser, "Lina");
  const code = await openRoom(host);
  await join(member, code);
  await editButton(host).click();
  await words(host).fill("70");
  await expect(mark(host, "wordCount")).toBeVisible();
  // The start, from another tab of the host: the settings are locked from the countdown.
  const second = await context.newPage();
  await second.goto(`/rooms/${code}`);
  await expect(second.getByText(LIVE)).toBeVisible();
  await second.getByRole("button", { name: "Lancer la course", exact: true }).click();
  await expect(host.locator(".course-texte")).toBeVisible({ timeout: 10_000 });
  await expect(panel(host)).toHaveCount(0);
  // The race froze the saved settings, not the draft; the draft was never sent.
  const [race] = await query<{ config: Record<string, unknown> }>("select config_snapshot as config from races r join lobbies l on l.current_race_id = r.id where l.code = $1", [code]);
  expect(race?.config.wordCount).toBe(50);
  expect((await savedRow(code))?.word_count).toBe(50);
});

test("losing the host role ends the edit without saving the draft", async ({ browser }) => {
  const { page: host } = await account(browser, "Capitaine");
  const { page: member } = await account(browser, "Lina");
  const code = await openRoom(host);
  await join(member, code);
  await editButton(host).click();
  await words(host).fill("80");
  await expect(mark(host, "wordCount")).toBeVisible();
  // Fixture: the role moves to the member in the database; the next room update tells both pages.
  await query("update lobbies set host_member_id = (select m.id from lobby_members m where m.lobby_id = lobbies.id and m.id <> lobbies.host_member_id and m.left_at is null limit 1), revision = revision + 1 where code = $1", [code]);
  await member.reload();
  await expect(member.getByText(LIVE)).toBeVisible();
  await member.getByRole("region", { name: "Bots", exact: true }).getByRole("button", { name: "Ajouter un bot" }).click();
  await expect(host.getByRole("region", { name: "Bots", exact: true }).getByRole("listitem")).toHaveCount(1);
  await expect(panel(host).locator("form")).toHaveCount(0);
  await expect(panel(host).getByRole("button")).toHaveCount(0);
  await expect(summary(host, /^Nombre de mots$/)).toHaveText("50");
  expect((await savedRow(code))?.word_count).toBe(50);
  await expect(editButton(member)).toHaveAttribute("aria-expanded", "false");
});

test("the open form stays usable at 200 % zoom, in forced colours and at 1024 and 360 px", async ({ browser }) => {
  const fill = async (page: Page) => {
    await editButton(page).click();
    await language(page).selectOption(await language(page).inputValue() === "fr" ? "en" : "fr");
    await panel(page).getByRole("button", { name: "Chiffres" }).click();
    await words(page).fill("9");
    await unlimited(page).uncheck();
    await seconds(page).fill("29");
    await expect(seconds(page)).toHaveAttribute("aria-invalid", "true");
  };
  const shot = (page: Page, name: string) => panel(page).screenshot({ path: EVIDENCE === undefined ? test.info().outputPath(`${name}.jpg`) : `${EVIDENCE}/${name}.jpg`, type: "jpeg", quality: 72 });
  const { page } = await account(browser, "Capitaine");
  await openRoom(page);
  await fill(page);
  // 200 % on a 1440 px screen is a 720 px layout; then the tablet and the smallest phone.
  for (const [width, name] of [[720, "9-zoom-200-fr-abysse-720"], [1024, "9-ouvert-fr-abysse-1024"], [360, "9-ouvert-fr-abysse-360"]] as const) {
    await page.setViewportSize({ width, height: width === 720 ? 450 : 900 });
    await expectNoHorizontalScroll(page);
    await expectNoAccessibilityViolation(page);
    // Every control keeps its 44 px target and stays inside the panel.
    const frame = await panel(page).boundingBox();
    if (!frame) throw new Error("panel");
    const boxes = await panel(page).locator("form").locator("select, input:not([type=checkbox]), button").evaluateAll((controls) => controls.map((control) => { const box = control.getBoundingClientRect(); return { height: box.height, left: box.left, right: box.right, what: control.outerHTML.slice(0, 90) }; }));
    for (const box of boxes) {
      expect(box.height, `width ${width}: ${box.what}`).toBeGreaterThanOrEqual(44);
      expect(box.left).toBeGreaterThanOrEqual(frame.x);
      expect(box.right).toBeLessThanOrEqual(frame.x + frame.width + 0.5);
    }
    for (const legend of ["Texte", "Durée", "Mode de frappe", "Mode de jeu"]) await expect(groupOf(page, new RegExp(`^${legend}$`))).toBeVisible();
    await shot(page, name);
  }
  // Forced colours: the pending and invalid states still have a sign and words, and a border.
  const { page: forced } = await account(browser, "Contraste", { forcedColors: true });
  await openRoom(forced);
  await fill(forced);
  await expectNoHorizontalScroll(forced);
  await expect(mark(forced, "textLanguage")).toContainText("⚠");
  await expect(panel(forced).getByText(/Choisis « Aucune limite » ou une durée entière/).locator("..")).toContainText("⚠");
  await expect(seconds(forced)).toHaveCSS("border-top-width", "2px");
  const tagBorder = await mark(forced, "textLanguage").locator("span").first().evaluate((tag) => getComputedStyle(tag).borderTopWidth);
  expect(tagBorder).toBe("1px");
  for (const legend of ["Texte", "Durée", "Mode de frappe", "Mode de jeu"]) await expect(groupOf(forced, new RegExp(`^${legend}$`))).toBeVisible();
  await shot(forced, "9-couleurs-forcees-fr-1440");
});
