import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import { query, signInWithCredentials } from "./support";

test.use({ locale: "fr-CA", actionTimeout: 10_000 });

async function room() {
  const [created] = await query<{ id: string; code: string }>("insert into lobbies(code,capacity) values('GHJNPR',30) returning id,code");
  if (!created) throw new Error("Missing synthetic room"); return created;
}
test.beforeEach(async () => { await query("update lobbies set host_member_id=null"); await query("delete from lobbies"); });

test("an invalid cookie requires explicit reset before a new identity can enter", async ({ page, context, baseURL }) => {
  const fixture = await room();
  await context.addCookies([{ name: "incision.guest", value: "malformed", url: baseURL ?? "", httpOnly: true }]);
  await page.goto(`/guest?code=${fixture.code}`);
  await page.getByLabel("Pseudo pour cette salle", { exact: true }).fill("Visitor");
  await page.getByRole("button", { name: "Entrer dans la salle", exact: true }).click();
  await expect(page.locator("#guest-entry-error")).toContainText("terminée ou invalide");
  expect((await context.cookies()).find((cookie) => cookie.name === "incision.guest")?.value).toBe("malformed");
  await page.getByRole("button", { name: "Effacer ma session invitée terminée", exact: true }).click();
  await expect(page.locator("#guest-entry-error")).toHaveCount(0);
  await page.getByRole("button", { name: "Entrer dans la salle", exact: true }).click();
  await expect(page.getByText("[.En direct]", { exact: true })).toBeVisible();
});

test("missing cross-tab coordination refuses guest entry without creating an identity", async ({ page, context }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "locks", { value: undefined }));
  await page.goto("/guest");
  await expect(page.getByRole("button", { name: "Entrer dans la salle", exact: true })).toBeDisabled();
  await expect(page.getByText("JavaScript et la coordination", { exact: false })).toBeVisible();
  expect((await context.cookies()).some((cookie) => cookie.name === "incision.guest")).toBe(false);
});

test("without JavaScript guest entry explains its limit and account login still works", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, locale: "fr-CA" });
  try {
    const page = await context.newPage(); await page.goto("/guest");
    await expect(page.getByRole("button", { name: "Entrer dans la salle", exact: true })).toBeDisabled();
    await expect(page.getByText("JavaScript et la coordination", { exact: false })).toBeVisible();
    const account = DEMO_ACCOUNTS[0]; if (!account) throw new Error("Missing synthetic account");
    await signInWithCredentials(page, account.login, account.password);
    await expect(page).toHaveURL(/\/account$/);
  } finally { await context.close(); }
});

test("simultaneous first guest entry and account login cannot leave both identities present", async ({ page, context }) => {
  const fixture = await room();
  const account = DEMO_ACCOUNTS[1]; if (!account) throw new Error("Missing synthetic account");
  const login = await context.newPage();
  await page.goto(`/guest?code=${fixture.code}`);
  await page.getByLabel("Pseudo pour cette salle", { exact: true }).fill("Visitor");
  await login.goto("/sign-in");
  await login.getByLabel("Nom d’utilisateur", { exact: true }).fill(account.login);
  await login.getByLabel("Mot de passe", { exact: true }).fill(account.password);
  await Promise.all([
    page.getByRole("button", { name: "Entrer dans la salle", exact: true }).click(),
    login.getByRole("button", { name: "Se connecter", exact: true }).click(),
  ]);
  await expect.poll(async () => new URL(login.url()).pathname === "/account" ||
    await login.getByRole("alert").filter({ hasText: "Quitte d’abord" }).count() > 0).toBe(true);
  await expect.poll(async () => new URL(page.url()).pathname.startsWith("/rooms/") ||
    await page.locator("#guest-entry-error").count() > 0).toBe(true);
  const session = await (await context.request.get("/api/auth/session")).json();
  const cookie = (await context.cookies()).find((cookie) => cookie.name === "incision.guest");
  const members = await query("select id from lobby_members where guest_session_id=$1 and left_at is null", [cookie?.value.split(".")[1] ?? null]);
  expect((session !== null) !== (members.length > 0)).toBe(true);
  await login.close();
});
