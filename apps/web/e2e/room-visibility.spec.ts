import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

async function account(browser: Browser, name: string, locale: string, javaScriptEnabled = true) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id,session_version", [name]);
  if (!row) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce", javaScriptEnabled }); contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return { page: await context.newPage(), accountId: row.id };
}

async function applySystemTheme(page: Page, colorScheme: "light" | "dark"): Promise<void> {
  await page.emulateMedia({ colorScheme });
  await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme === "light" ? "aube" : "abysse");
  await page.evaluate(async () => {
    await Promise.all(document.getAnimations().filter((animation) =>
      animation.effect?.getComputedTiming().iterations !== Infinity,
    ).map((animation) => animation.finished.catch(() => undefined)));
  });
}

async function auditEveryLayout(page: Page, name: string): Promise<void> {
  for (const theme of ["light", "dark"] as const) {
    await applySystemTheme(page, theme);
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page);
      await expectNoAccessibilityViolation(page);
      await page.screenshot({ path: test.info().outputPath(`${name}-${theme}-${width}.png`), fullPage: true });
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
}

const live = /^\[\.(En direct|Live)\]$/;
const panelName = /^(Visibilité de la salle|Room visibility)$/;
const editName = /^(Modifier la visibilité|Edit visibility)$/;
const saveName = /^(Enregistrer la visibilité|Save visibility)$/;
const label = { private: /^(Privée|Private)$/, code: /^(Sur code|By code)$/, public: /^(Publique|Public)$/ };

for (const locale of ["fr-CA", "en-US"]) {
  test(`host picks and changes visibility; PRIVATE refuses the code alone (${locale})`, async ({ browser }) => {
    const host = await account(browser, "Visibility host", locale);
    const member = await account(browser, "Visibility member", locale);
    const outsider = await account(browser, "Visibility outsider", locale);

    await host.page.goto("/rooms/new");
    const access = host.page.getByRole("group", { name: /^(Accès|Access)$/ });
    await expect(access.getByRole("radio", { name: label.code })).toBeChecked();
    // Keyboard: arrows move within the radio group, from "by code" to "private".
    await access.getByRole("radio", { name: label.code }).focus();
    await host.page.keyboard.press("ArrowRight");
    await expect(access.getByRole("radio", { name: label.private })).toBeChecked();
    await expect(access.getByRole("radio", { name: label.private })).toBeFocused();
    await auditEveryLayout(host.page, `creation-${locale}`);
    await host.page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
    await expect(host.page.getByText(live)).toBeVisible();
    const code = host.page.url().split("/").at(-1)!;
    expect(await query("select visibility from lobbies where code=$1", [code])).toEqual([{ visibility: "private" }]);

    const panel = host.page.getByRole("region", { name: panelName });
    await expect(panel.getByText(label.private)).toBeVisible();

    // PRIVATE: the code alone answers exactly like an unknown code.
    await member.page.goto(`/rooms/${code}`);
    await expect(member.page.getByRole("heading", { name: /^(Code introuvable|Code not found)$/ })).toBeVisible();

    // The host opens it "by code" with the keyboard; the member can now join with the code.
    await panel.getByRole("button", { name: editName }).focus();
    await host.page.keyboard.press("Enter");
    const choices = panel.getByRole("group", { name: /^(Accès|Access)$/ });
    await expect(choices.getByRole("radio", { name: label.private })).toBeFocused();
    await host.page.keyboard.press("ArrowLeft");
    await expect(choices.getByRole("radio", { name: label.code })).toBeChecked();
    await panel.getByRole("button", { name: saveName }).click();
    await expect(panel.getByRole("status")).toHaveText(/^(Visibilité enregistrée\.|Visibility saved\.)$/);
    await expect(panel.getByRole("button", { name: editName })).toBeFocused();
    await expect(panel.getByText(label.code)).toBeVisible();

    await member.page.goto(`/rooms/${code}`);
    await member.page.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
    await expect(member.page.getByText(live)).toBeVisible();
    const memberPanel = member.page.getByRole("region", { name: panelName });
    await expect(memberPanel.getByText(label.code)).toBeVisible();
    await expect(memberPanel.getByRole("button", { name: editName })).toHaveCount(0);

    // Live sync: the member sees PUBLIC, then PRIVATE, without reloading, and stays in the room.
    for (const next of ["public", "private"] as const) {
      await panel.getByRole("button", { name: editName }).click();
      await panel.getByRole("radio", { name: label[next] }).check();
      await panel.getByRole("button", { name: saveName }).click();
      await expect(memberPanel.getByText(label[next])).toBeVisible();
    }
    await expect(member.page.getByText(live)).toBeVisible();
    await auditEveryLayout(host.page, `room-host-${locale}`);
    await auditEveryLayout(member.page, `room-member-${locale}`);

    await outsider.page.goto(`/rooms/${code}`);
    await expect(outsider.page.getByRole("heading", { name: /^(Code introuvable|Code not found)$/ })).toBeVisible();
    await member.page.reload();
    await expect(memberPanel.getByText(label.private)).toBeVisible();
  });

  test(`a stale page is refused with an explicit message (${locale})`, async ({ browser }) => {
    const host = await account(browser, "Stale host", locale);
    await host.page.goto("/rooms/new");
    await host.page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
    await expect(host.page.getByText(live)).toBeVisible();
    const code = host.page.url().split("/").at(-1)!;
    const panel = host.page.getByRole("region", { name: panelName });
    await panel.getByRole("button", { name: editName }).click();
    await panel.getByRole("radio", { name: label.public }).check();
    // Another tab of the host moved the room on: the open form now quotes an old revision.
    await query("update lobbies set revision = revision + 1 where code=$1", [code]);
    await panel.getByRole("button", { name: saveName }).click();
    await expect(panel.getByRole("alert")).toHaveText(/(La salle a changé|The room changed)/);
    expect(await query("select visibility from lobbies where code=$1", [code])).toEqual([{ visibility: "code" }]);
    await panel.getByRole("button", { name: /^(Actualiser la salle|Refresh room)$/ }).click();
    await expect(panel.getByRole("button", { name: editName })).toBeEnabled();
  });

  test(`creation keeps the chosen visibility without JavaScript (${locale})`, async ({ browser }) => {
    const host = await account(browser, "No JS visibility host", locale, false);
    await host.page.goto("/rooms/new");
    await host.page.getByRole("radio", { name: label.public }).check();
    await host.page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
    await expect(host.page).toHaveURL(/\/rooms\/[A-Z2-9]{6}$/);
    expect(await query("select l.visibility from lobbies l join lobby_members m on m.id=l.host_member_id where m.account_id=$1", [host.accountId]))
      .toEqual([{ visibility: "public" }]);
  });
}
