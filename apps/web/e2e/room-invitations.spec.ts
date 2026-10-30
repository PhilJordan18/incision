import { type Browser, type BrowserContext, expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });
async function account(browser: Browser, name: string, locale: string) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id,session_version", [name]);
  if (!row) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" }); contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: test.info().project.use.baseURL ?? "" }]);
  return context.newPage();
}

for (const locale of ["fr-CA", "en-US"]) test(`invitation lifecycle, privacy and responsive controls (${locale})`, async ({ browser }, info) => {
  const host = await account(browser, "Host", locale);
  const member = await account(browser, "Member", locale);
  const other = await account(browser, "Other", locale);
  await host.goto("/rooms/new");
  await host.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(host.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  const code = host.url().split("/").at(-1)!;
  // PRIVATE creation controls belong to L1; this fixture isolates invitation admission.
  await query("update lobbies set visibility='private' where code=$1", [code]);
  const panel = host.getByRole("region", { name: "Invitations", exact: true });
  await expect(panel).toHaveCount(1);
  await panel.getByRole("button", { name: /^(Générer une invitation|Generate an invitation)$/ }).click();
  const field = panel.getByLabel(/^(Lien d’invitation|Invitation link)$/);
  await expect(field).toHaveValue(/\/invite#[A-Za-z0-9_-]{43}$/);
  const link = await field.inputValue(); const token = link.split("#")[1]!;
  const urls: string[] = [];
  member.on("request", (request) => urls.push(request.url()));
  await member.goto(link);
  await expect(member.getByRole("heading", { name: /^(Rejoindre par invitation|Join by invitation)$/ })).toBeVisible();
  await expectNoAccessibilityViolation(member);
  await member.getByRole("button", { name: /^(Rejoindre avec mon compte|Join with my account)$/ }).click();
  await expect(member).toHaveURL(new RegExp(`/rooms/${code}$`));
  await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  expect(urls.every((url) => !url.includes(token))).toBe(true);
  await expect(member.getByRole("region", { name: "Invitations", exact: true })).toHaveCount(0);
  await panel.getByRole("button", { name: /^(Afficher \/ actualiser les invitations|Show \/ refresh invitations)$/ }).click();
  await expect(panel.getByRole("listitem")).toContainText("Member");
  await other.goto(link);
  await other.getByRole("button", { name: /^(Rejoindre avec mon compte|Join with my account)$/ }).click();
  await expect(other.getByRole("main").getByRole("alert")).toContainText(/Invitation (indisponible|unavailable)/);
  for (const theme of ["abysse", "aube"]) {
    await host.evaluate((value) => document.documentElement.dataset.theme = value, theme);
    for (const width of [1440, 1024, 390]) {
      await host.setViewportSize({ width, height: 1000 });
      await expectNoHorizontalScroll(host); await expectNoAccessibilityViolation(host);
      await host.screenshot({ path: info.outputPath(`${locale}-${theme}-${width}.png`), fullPage: true });
    }
  }
  await panel.getByRole("button", { name: /^(Révoquer|Revoke)$/ }).click();
  await expect(panel.getByRole("listitem")).toContainText(/Révoquée|Revoked/);
  await member.goto(link);
  await member.getByRole("button", { name: /^(Rejoindre avec mon compte|Join with my account)$/ }).click();
  await expect(member.getByRole("main").getByRole("alert")).toContainText(/Invitation (indisponible|unavailable)/);
  await host.reload(); await expect(host.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  await expect(host.getByLabel(/^(Lien d’invitation|Invitation link)$/)).toHaveCount(0);
});

test("a fresh guest can use an invitation without sharing its token with the session endpoint", async ({ browser }) => {
  const host = await account(browser, "Host", "en-US");
  await host.goto("/rooms/new"); await host.getByRole("button", { name: "Open the room", exact: true }).click();
  await expect(host.getByText("[.Live]", { exact: true })).toBeVisible();
  await host.getByRole("button", { name: "Generate an invitation" }).click();
  const field = host.getByLabel("Invitation link", { exact: true }); await expect(field).toHaveValue(/#/);
  const link = await field.inputValue();
  const context = await browser.newContext({ locale: "en-US" }); contexts.push(context);
  const guest = await context.newPage(); await guest.goto(link);
  await guest.getByLabel("Nickname", { exact: false }).first().fill("Sailor");
  await guest.getByRole("button", { name: "Enter the room", exact: true }).click();
  await expect(guest).toHaveURL(/\/rooms\/[A-Z0-9]{6}$/);
  await expect(guest.getByText("[.Live]", { exact: true })).toBeVisible();
});
