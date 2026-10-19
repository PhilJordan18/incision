import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * The first complete race (F-04.0) in real browsers: two accounts, the countdown on the server's
 * clock, typing validated by the engine on the server, everyone's progress, the results saved and
 * read again. The host's pages are in English, so the race text is the English test fixture
 * (the text follows the host's language, D-19); the guest's pages are in French.
 */
const contexts: BrowserContext[] = [];

test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
});

/** A new account of its own with a session cookie (the demo accounts' limits are shared by every spec). */
async function signedIn(browser: Browser, displayName: string, options: { locale: "fr-CA" | "en-US"; width?: number; theme?: "abysse" | "aube" }): Promise<{ page: Page; context: BrowserContext }> {
  const [created] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [displayName]);
  if (created === undefined) {
    throw new Error("The account was not created");
  }
  const baseURL = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext({ locale: options.locale, ...(options.width === undefined ? {} : { viewport: { width: options.width, height: 800 } }) });
  contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: created.id, sessionVersion: created.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL }]);
  if (options.theme !== undefined) {
    await context.addCookies([{ name: "theme", value: options.theme, url: baseURL }]);
  }
  return { page: await context.newPage(), context };
}

/** Opens a room as `host`, whose pages are in English or in French. */
async function openRoom(host: Page): Promise<string> {
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: /^(Open the room|Ouvrir la salle)$/ }).click();
  await expect(host).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  await expect(host.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
  return host.url().split("/").at(-1) ?? "";
}

/** Joins the room `code` as `guest`, whose pages are in French or in English. */
async function join(guest: Page, code: string): Promise<void> {
  await guest.goto(`/rooms/${code}`);
  await guest.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
  await expect(guest.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
}

/** The room's crew, as the waiting room lists it. */
function crewOf(page: Page) {
  return page.getByRole("region", { name: "Équipage" }).getByRole("listitem");
}

/** The text as the page shows it, grapheme by grapheme. */
async function raceText(page: Page): Promise<string> {
  const text = page.locator(".course-texte");
  await expect(text).toBeVisible();
  return (await text.textContent()) ?? "";
}

/** Types like a person, below the engine's plausibility limit (25 graphemes a second). */
async function typeText(field: ReturnType<Page["getByLabel"]>, text: string): Promise<void> {
  await field.pressSequentially(text, { delay: 70 });
}

test.describe("the first complete race (F-04.0)", () => {
  test("two players race: countdown, typing checked by the server, progress, results stored and reopened", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA" });
    const code = await openRoom(host);
    await expect(host.getByRole("button", { name: "Start the race" })).toBeDisabled();
    await join(guest, code);
    // Only the host has the start, the waiting room's one red action.
    await expect(guest.getByRole("button", { name: "Lancer la course" })).toHaveCount(0);
    const start = host.getByRole("button", { name: "Start the race" });
    await expect(start).toBeEnabled();
    await expectNoAccessibilityViolation(host);
    await start.click();

    // The 3-2-1 countdown on both sides, then the text, in the host's language.
    await expect(guest.getByRole("timer")).toBeVisible();
    await expect(host.getByRole("timer")).toBeVisible();
    const text = await raceText(guest);
    expect(text).toBe("Test text: the sea is calm and the wind rises.");
    await expectNoAccessibilityViolation(guest);
    const hostField = host.getByLabel("Your typing");
    const guestField = guest.getByLabel("Ta frappe");
    await expect(hostField).toBeEnabled({ timeout: 6_000 });
    await expect(guestField).toBeEnabled();

    // Paste and drop are refused: a pasted text never becomes keystrokes (screen 08).
    await guestField.evaluate((field) => {
      field.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertFromPaste", data: "Test text", bubbles: true, cancelable: true }));
      const data = new DataTransfer();
      data.setData("text/plain", "Test text");
      field.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(guest.locator(".course-texte .course-juste")).toHaveCount(0);
    await expect(guestField).toHaveValue("");
    // A wrong letter is blocked in mandatory correction (D-19) until fixed.
    await guestField.press("x");
    await expect(guest.getByText("Corrige le « T » encadré pour avancer.")).toBeVisible();
    await expect(guestField).toHaveAttribute("aria-invalid", "true");
    await guestField.press("Backspace");

    // A third account cannot come in during the race (SALLE-09).
    const { page: late } = await signedIn(browser, "Retardataire", { locale: "fr-CA" });
    await late.goto(`/rooms/${code}`);
    await expect(late.getByRole("heading", { level: 1 })).toContainText(/Course/i);
    await expect(late.getByRole("button", { name: "Rejoindre la salle" })).toHaveCount(0);

    await typeText(hostField, text.slice(0, 20));
    // The guest sees the host's progress live (COURSE-05), from the server.
    await expect(guest.getByRole("progressbar", { name: "Capitaine" })).not.toHaveAttribute("value", "0");
    await Promise.all([typeText(hostField, text.slice(20)), typeText(guestField, text)]);

    // Results, read from the database once saved: arrival order (COURSE-10), measures from the engine.
    await expect(host.getByRole("heading", { name: /End of the crossing/i })).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });
    const rows = host.getByRole("table").getByRole("row");
    await expect(rows).toHaveCount(3);
    await expect(rows.nth(1)).toContainText("1st");
    await expect(rows.nth(1)).toContainText("Capitaine");
    await expect(guest.getByRole("table").getByRole("row").nth(2)).toContainText("Matelot");
    await expectNoAccessibilityViolation(host);
    // The results take the focus when the race ends (WCAG 2.4.3).
    await expect(host.getByRole("heading", { level: 1 })).toBeFocused();

    // The race page, rebuilt from the stored snapshot, after a reload too (HIST-02).
    await guest.getByRole("link", { name: "Voir la fiche de la course" }).click();
    await expect(guest).toHaveURL(/\/races\/[0-9a-f-]{36}$/);
    await guest.reload();
    await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible();
    await expect(guest.getByRole("table").getByRole("row")).toHaveCount(3);
    await expectNoAccessibilityViolation(guest);
    // Not an entrant: the same "not found" as an unknown race.
    await late.goto(guest.url());
    await expect(late.getByRole("heading", { level: 1 })).toHaveText("Course introuvable");
  });

  test("a second tab of the same player watches, takes the input on request, and a reload resumes from the server", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest, context } = await signedIn(browser, "Matelot", { locale: "fr-CA" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(guest);
    const field = guest.getByLabel("Ta frappe");
    await expect(field).toBeEnabled({ timeout: 6_000 });
    await typeText(field, text.slice(0, 6));

    const second = await context.newPage();
    await second.goto(`/rooms/${code}`);
    await expect(second.getByText("Tu tapes dans un autre onglet ; celui-ci regarde.")).toBeVisible();
    await expect(second.getByLabel("Ta frappe")).toBeDisabled();
    await second.getByRole("button", { name: "Taper dans cet onglet" }).click();
    await expect(second.getByLabel("Ta frappe")).toBeEnabled();
    await expect(guest.getByText("Tu tapes dans un autre onglet ; celui-ci regarde.")).toBeVisible();
    await typeText(second.getByLabel("Ta frappe"), text.slice(6, 10));

    // A reload: the page comes back with what the server applied, and goes on from there. A
    // keystroke not yet sent when the page goes away is lost by design (one batch in flight):
    // the reload waits until the server has applied all ten, as the host's track shows.
    await expect(host.getByRole("progressbar", { name: "Matelot" })).toHaveAttribute("value", "10");
    const reloadedAt = Date.now();
    await second.reload();
    await expect(second.locator(".course-texte .course-juste")).toHaveCount(10);
    // The reloaded tab keeps its page id and takes its input back at once, before the server's
    // 3 s grace would hand it over, and without asking for it.
    await expect(second.getByLabel("Ta frappe")).toBeEnabled({ timeout: 1_000 });
    await expect(second.getByRole("button", { name: "Taper dans cet onglet" })).toBeHidden();
    expect(Date.now() - reloadedAt).toBeLessThan(3_000);
    await typeText(second.getByLabel("Ta frappe"), text.slice(10));
    await typeText(host.getByLabel("Your typing"), text);
    await expect(second.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });
  });

  test("each interruption seen on an open page takes the focus, even twice in a row", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA" });
    const code = await openRoom(host);
    await join(guest, code);
    const heading = host.locator("#interrupted-heading");
    for (const round of [1, 2]) {
      // A race of the room that no process runs any more: its lease ran out (ADR-0004).
      const abandoned = await query(
        `with room as (select id from lobbies where code = $1),
         race as (
           insert into races (lobby_id, round_no, state, rules_version, text_snapshot, config_snapshot, countdown_at, started_at, owner_id, lease_expires_at)
           select id, $2, 'racing', 1, 'Test text.', '{}'::jsonb, now() - interval '1 minute', now() - interval '50 seconds', gen_random_uuid(), now() - interval '10 seconds' from room
           returning id, lobby_id
         )
         update lobbies set phase = 'racing', current_race_id = race.id from race where lobbies.id = race.lobby_id
         returning lobbies.id`,
        [code, round],
      );
      expect(abandoned).toHaveLength(1);
      // The host's focus is on the start button, which the new race id replaces.
      await host.getByRole("button", { name: "Start the race" }).focus();
      // The guest's new watch recovers the race (owner_lost), and every member's page learns it.
      await guest.reload();
      await expect(heading).toHaveText(/Race interrupted/);
      await expect(heading).toBeFocused();
      await expect(host.getByText("The server running the race stopped answering: it has no results.")).toBeVisible();
    }
  });

  test("a player who leaves during the race abandons, and keeps a ranked result", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA", width: 360, theme: "aube" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(guest);
    await expect(guest.getByLabel("Ta frappe")).toBeEnabled({ timeout: 6_000 });
    await expectNoHorizontalScroll(guest);
    await typeText(guest.getByLabel("Ta frappe"), text.slice(0, 5));
    await guest.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest).toHaveURL(/\/$/);

    await typeText(host.getByLabel("Your typing"), text);
    await expect(host.getByRole("heading", { name: /End of the crossing/i })).toBeVisible({ timeout: 15_000 });
    const rows = host.getByRole("table").getByRole("row");
    await expect(rows.nth(2)).toContainText("Matelot");
    await expect(rows.nth(2)).toContainText("abandoned");
    // The results at 360 px: no horizontal page scroll, and the table's region reachable by keyboard.
    await host.setViewportSize({ width: 360, height: 800 });
    await expectNoHorizontalScroll(host);
    await expectNoAccessibilityViolation(host);
  });

  test("a player gives up only after confirming it, and the results say it was a choice (COURSE-07)", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA", width: 360, theme: "aube" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(guest);
    const field = guest.getByLabel("Ta frappe");
    await expect(field).toBeEnabled({ timeout: 6_000 });
    await typeText(field, text.slice(0, 4));

    // Asked first; Escape keeps racing and gives the focus back to the field.
    const guestGiveUp = guest.getByRole("button", { name: "Abandonner la course" });
    await guestGiveUp.click();
    await expect(guest.getByRole("heading", { name: "Abandonner la course ?" })).toBeFocused();
    await expectNoAccessibilityViolation(guest);
    await expectNoHorizontalScroll(guest);
    await guest.keyboard.press("Escape");
    await expect(field).toBeFocused();
    await expect(guest.getByRole("heading", { name: "Abandonner la course ?" })).toHaveCount(0);

    // The host gives up for good.
    await host.getByRole("button", { name: "Give up the race" }).click();
    await expect(host.getByRole("heading", { name: "Give up the race?" })).toBeFocused();
    await expectNoAccessibilityViolation(host);
    await host.getByRole("button", { name: "Yes, give up" }).click();
    // The focus goes to the line that says it.
    await expect(host.locator("#race-typing-status")).toBeFocused();
    await expect(host.locator("#race-typing-status")).toHaveText("You gave up. You can follow the race to the end.");
    await expect(host.getByLabel("Your typing")).toBeDisabled();
    await expect(host.getByRole("button", { name: "Give up the race" })).toHaveCount(0);
    // The others see it on the list, from the server.
    await expect(guest.getByRole("region", { name: "Équipage en course" }).getByRole("listitem").filter({ hasText: "Capitaine" })).toContainText("abandon");

    await typeText(field, text.slice(4));
    await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });
    await expect(guest.getByRole("table").getByRole("row").nth(2)).toContainText("abandon (volontaire)");
    await expect(host.getByRole("table").getByRole("row").nth(2)).toContainText("abandoned (voluntary)");
  });

  test("an idle player is asked if they are still there after 60 s; the button or a keystroke clears it for everyone (D-17)", async ({ browser }) => {
    test.setTimeout(150_000);
    // The dark theme (Abysse) for the host, the light one (Aube) for the guest.
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US", theme: "abysse" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA", theme: "aube" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(guest);
    await expect(guest.getByLabel("Ta frappe")).toBeEnabled({ timeout: 6_000 });
    // Nobody types for a minute.
    const hostQuestion = host.getByRole("heading", { name: "Are you still there?" });
    const guestQuestion = guest.getByRole("heading", { name: "Tu es toujours là ?" });
    await expect(hostQuestion).toBeVisible({ timeout: 70_000 });
    await expect(guestQuestion).toBeVisible({ timeout: 5_000 });
    const guestOnHost = host.getByRole("region", { name: "Crew racing" }).getByRole("listitem").filter({ hasText: "Matelot" });
    const hostOnGuest = guest.getByRole("region", { name: "Équipage en course" }).getByRole("listitem").filter({ hasText: "Capitaine" });
    await expect(guestOnHost).toContainText("inactive");
    await expect(hostOnGuest).toContainText("inactif");
    await expectNoAccessibilityViolation(host);
    await expectNoAccessibilityViolation(guest);

    // The button for one, a keystroke for the other; the button gives the focus back to typing.
    await host.getByRole("button", { name: "I’m here" }).click();
    await expect(hostQuestion).toHaveCount(0);
    await expect(host.getByLabel("Your typing")).toBeFocused();
    // A presence, never an abandon: the host still races.
    await expect(host.getByRole("region", { name: "Crew racing" }).getByRole("listitem").filter({ hasText: "Capitaine" })).toContainText("racing");
    await expect(hostOnGuest).not.toContainText("inactif");
    await typeText(guest.getByLabel("Ta frappe"), text.slice(0, 1));
    await expect(guestQuestion).toHaveCount(0);
    await expect(guestOnHost).not.toContainText("inactive");
  });

  test("the host takes everyone present to the next round, a newcomer included, and races them again (F-04.7)", async ({ browser }) => {
    // A whole race, a newcomer, axe at 360 px, then a second start: about 16 s on a calm machine;
    // 60 s leaves room under load, where the default 30 s would be tight.
    test.setTimeout(60_000);
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "fr-CA", width: 360, theme: "aube" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "en-US" });
    const { page: leaver } = await signedIn(browser, "Mousse", { locale: "fr-CA" });
    const code = await openRoom(host);
    await join(guest, code);
    await join(leaver, code);
    await host.getByRole("button", { name: "Lancer la course" }).click();
    const text = await raceText(guest);
    await expect(guest.getByLabel("Your typing")).toBeEnabled({ timeout: 6_000 });
    await leaver.getByRole("button", { name: "Abandonner la course" }).click();
    await leaver.getByRole("button", { name: "Oui, abandonner" }).click();
    await Promise.all([typeText(host.getByLabel("Ta frappe"), text), typeText(guest.getByLabel("Your typing"), text)]);
    await expect(host.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });

    // During the results, someone joins and someone leaves; only the host is offered the next round.
    const { page: newcomer } = await signedIn(browser, "Vigie", { locale: "fr-CA" });
    await join(newcomer, code);
    await leaver.getByRole("button", { name: "Quitter la salle" }).click();
    await expect(guest.getByRole("heading", { name: /End of the crossing/i })).toBeVisible();
    await expect(guest.getByRole("region", { name: "Host actions" })).toHaveCount(0);
    await expect(newcomer.getByRole("region", { name: "Actions de l’hôte" })).toHaveCount(0);
    // As on screen 10: the host's actions, beside the race page, come before the ranking.
    const actions = host.getByRole("region", { name: "Actions de l’hôte" });
    await expect(actions.getByRole("link", { name: "Voir la fiche de la course" })).toBeVisible();
    expect(await actions.evaluate((element) => Boolean(element.compareDocumentPosition(document.querySelector("table") ?? element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    await expectNoAccessibilityViolation(host);
    await expectNoHorizontalScroll(host);
    await actions.getByRole("button", { name: "Prochaine manche" }).click();

    // Everyone present waits again, the focus on the room's heading, without a reload.
    await expect(host.getByRole("button", { name: "Lancer la course" })).toBeVisible();
    await expect(host.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(guest.getByRole("heading", { level: 1 })).toBeFocused();
    await expect(crewOf(newcomer)).toHaveCount(3);
    await host.getByRole("button", { name: "Lancer la course" }).click();
    await expect(newcomer.getByLabel("Ta frappe")).toBeEnabled({ timeout: 6_000 });
    const runners = host.getByRole("region", { name: "Équipage en course" }).getByRole("listitem");
    await expect(runners).toHaveCount(3);
    await expect(runners.filter({ hasText: "Mousse" })).toHaveCount(0);
    await expect(runners.filter({ hasText: "Vigie" })).toHaveCount(1);
  });

  test("the host closes the room from the results: everyone sees it closed, and the race stays readable (F-04.7)", async ({ browser }) => {
    const { page: host } = await signedIn(browser, "Capitaine", { locale: "en-US", theme: "abysse" });
    const { page: guest } = await signedIn(browser, "Matelot", { locale: "fr-CA", width: 360, theme: "aube" });
    const code = await openRoom(host);
    await join(guest, code);
    await host.getByRole("button", { name: "Start the race" }).click();
    const text = await raceText(host);
    await expect(guest.getByLabel("Ta frappe")).toBeEnabled({ timeout: 6_000 });
    await guest.getByRole("button", { name: "Abandonner la course" }).click();
    await guest.getByRole("button", { name: "Oui, abandonner" }).click();
    await typeText(host.getByLabel("Your typing"), text);
    await expect(guest.getByRole("heading", { name: /Fin de la traversée/i })).toBeVisible({ timeout: 15_000 });
    const raceHref = await guest.getByRole("link", { name: "Voir la fiche de la course" }).getAttribute("href");
    await expect(host.getByRole("region", { name: "Host actions" })).toBeVisible();
    await expectNoAccessibilityViolation(host);

    await host.getByRole("button", { name: "Close the room" }).click();
    await expect(host.getByText(`You closed room ${code} for everyone.`)).toBeVisible();
    await expect(host.getByRole("heading", { name: /Room\s*closed/i })).toBeFocused();
    await expect(guest.getByText(`L’hôte a fermé la salle ${code} pour tout le monde.`)).toBeVisible();
    await expect(guest.getByRole("heading", { name: /Salle\s*fermée/i })).toBeFocused();
    await expectNoAccessibilityViolation(guest);
    await expectNoHorizontalScroll(guest);
    // The race stays in its runners' history (HIST-02).
    await guest.goto(raceHref ?? "/");
    await expect(guest.getByRole("table").getByRole("row").nth(2)).toContainText("Matelot");
  });
});

