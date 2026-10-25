import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { bonusFixture, BONUS_TEXT } from "./bonus-fixture";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
let fixture: Awaited<ReturnType<typeof bonusFixture>> | undefined;
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(async context => {
    // Pending long polls are cancelled by teardown, not test failures.
    await context.unrouteAll({ behavior: "ignoreErrors" });
    await context.close();
  }));
  await fixture?.close(); fixture = undefined;
});

async function player(browser: Browser, name: string, locale: "fr-CA" | "en-US", theme: "abysse" | "aube") {
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts (display_name) values ($1) returning id, session_version", [name]);
  const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
  const baseURL = test.info().project.use.baseURL!;
  const token = await forgeSessionCookie({ sub: account!.id, sessionVersion: account!.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: token, url: baseURL }, { name: "theme", value: theme, url: baseURL }]);
  return { page: await context.newPage(), context, accountId: account!.id };
}

async function setup(browser: Browser) {
  const actor = await player(browser, "Capitaine", "fr-CA", "aube");
  const leader = await player(browser, "Matelot", "en-US", "abysse");
  await actor.page.goto("/rooms/new"); await actor.page.getByRole("button", { name: "Ouvrir la salle", exact: true }).click();
  await expect(actor.page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  const url = actor.page.url(); const code = url.split("/").at(-1)!;
  await leader.page.goto(url); await leader.page.getByRole("button", { name: "Join the room", exact: true }).click();
  await expect(leader.page.getByText("[.Live]")).toBeVisible();
  const members = await query<{ id: string; display_name: string; account_id: string }>(
    "select m.id, a.display_name, m.account_id from lobby_members m join lobbies l on m.lobby_id=l.id join accounts a on a.id=m.account_id where l.code=$1 order by (m.account_id=$2) desc", [code, actor.accountId]);
  fixture = await bonusFixture({ code, phase: "waiting", capacity: 6, revision: 1000, members: members.map(member => ({
    memberId: member.id, displayName: member.display_name, role: "participant", isHost: member.account_id === actor.accountId, online: true,
  })) });
  await fixture.route(actor.context, members[0]!.id); await fixture.route(leader.context, members[1]!.id);
  await Promise.all([actor.page.reload(), leader.page.reload()]);
  await expect(actor.page.getByText("[.En direct]")).toBeVisible(); await expect(leader.page.getByText("[.Live]")).toBeVisible();
  await actor.page.getByRole("button", { name: "Lancer la course" }).click();
  await expect(actor.page.getByLabel("Ta frappe")).toBeEnabled({ timeout: 10000 });
  await expect(leader.page.getByLabel("Your typing")).toBeEnabled();
  await leader.page.getByLabel("Your typing").pressSequentially(BONUS_TEXT.slice(0, 22), { delay: 75 });
  await expect(actor.page.getByRole("list", { name: "Tes bonus · ordre d’utilisation" }).getByRole("listitem")).toHaveCount(3);
  return { actor, leader, fixture, url };
}

test("real race view and runtime: FIFO, Enter guards, three effects, translated target feedback and results", async ({ browser }) => {
  test.setTimeout(90000);
  const { actor, leader, fixture } = await setup(browser);
  const field = actor.page.getByLabel("Ta frappe"); const target = leader.page.locator(".course-texte");
  await field.focus();
  const documentTop = () => field.evaluate(element => element.getBoundingClientRect().top + window.scrollY);
  const before = await documentTop();
  await field.dispatchEvent("keydown", { key: "Enter", repeat: true });
  await field.dispatchEvent("compositionstart", {});
  await field.dispatchEvent("keydown", { key: "Enter" });
  await field.dispatchEvent("compositionend", { data: "" });
  await field.dispatchEvent("keydown", { key: "Enter", isComposing: true });
  await field.press("Shift+Enter");
  await actor.page.getByRole("button", { name: "Abandonner la course", exact: true }).click();
  await field.focus(); await field.press("Enter"); // Even deliberately refocusing cannot bypass an open question.
  expect(fixture.commands()).toBe(0);
  await actor.page.getByRole("heading", { name: "Abandonner la course ?", exact: true }).focus();
  await actor.page.keyboard.press("Escape"); await expect(field).toBeFocused();
  await field.press("Enter");
  await expect(actor.page.locator(".course-texte")).toHaveText("aa bb cc dd ee ff gg");
  await expect(actor.page.getByText("Capitaine active Raccourci → Capitaine.")).toBeVisible();
  await expect(field).toBeFocused(); expect(await documentTop()).toBe(before);
  await field.press("Enter");
  await expect(target).toHaveText(`${BONUS_TEXT} sea port sail`);
  await expect(leader.page.getByText("Capitaine activates Extension → Matelot.")).toBeVisible();
  await field.press("Enter");
  await expect(target.locator('[aria-hidden="true"]')).not.toHaveCount(0);
  await expect(leader.page.getByText(/Fog: upcoming words/)).toBeVisible();
  expect(await target.locator('span:not([aria-hidden="true"])').allTextContents()).toEqual([...BONUS_TEXT.slice(0, 24)]);
  await expect(target.locator('[aria-hidden="true"]')).toHaveCount(0, { timeout: 5000 });
  await expect(actor.page.getByText("Aucun bonus en réserve.")).toBeVisible();
  expect(fixture.commands()).toBe(3);
  for (const page of [actor.page, leader.page]) {
    for (const width of [1440, 1024, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(page);
      await page.screenshot({ path: test.info().outputPath(`bonus-${page === actor.page ? "fr-aube" : "en-abysse"}-${width}.png`), fullPage: true });
    }
    await page.setViewportSize({ width: 360, height: 800 }); await expectNoAccessibilityViolation(page);
  }
  await Promise.all([
    field.pressSequentially("aa bb cc dd ee ff gg", { delay: 75 }),
    leader.page.getByLabel("Your typing").pressSequentially(`${BONUS_TEXT.slice(22)} sea port sail`, { delay: 75 }),
  ]);
  await expect.poll(() => fixture.results().length).toBe(2);
  expect(fixture.results().every(result => result.outcome === "finished" && Number.isFinite(result.netWpm))).toBe(true);
  await expect(field).toBeDisabled();
});

test("observer control transfer and reload restore the private inventory without replaying announcements", async ({ browser }) => {
  test.setTimeout(60000);
  const { actor, fixture, url } = await setup(browser);
  const second = await actor.context.newPage(); await second.goto(url);
  const secondField = second.getByLabel("Ta frappe");
  await expect(secondField).toBeDisabled();
  await expect(second.getByText(/Reprends la frappe dans cet onglet/)).toBeVisible();
  await second.getByRole("button", { name: "Taper dans cet onglet" }).click();
  await expect(secondField).toBeEnabled();
  await expect(second.getByText(/Entrée dans le champ de frappe active/)).toBeVisible();
  await secondField.press("Enter"); await expect(second.locator(".course-texte")).toHaveText("aa bb cc dd ee ff gg");
  await expect(actor.page.getByLabel("Ta frappe")).toBeDisabled();
  await second.reload(); await expect(secondField).toBeEnabled();
  await expect(second.getByRole("list", { name: "Tes bonus · ordre d’utilisation" }).getByRole("listitem")).toHaveCount(2);
  await expect(second.getByText("Capitaine active Raccourci → Capitaine.")).toHaveCount(0);
  await secondField.press("Enter");
  await expect(second.getByText("Capitaine active Rallonge → Matelot.")).toBeVisible();
  expect(fixture.commands()).toBe(2);
});
