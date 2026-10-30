import { expect, test, type BrowserContext } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

async function authenticate(context: BrowserContext, name: string) {
  const [row] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values($1) returning id,session_version", [name]);
  if (!row) throw new Error("No account");
  await context.addCookies([{ name: SESSION_COOKIE, value: await forgeSessionCookie({ sub: row.id, sessionVersion: row.session_version, authTime: Math.floor(Date.now() / 1000) }), url: test.info().project.use.baseURL ?? "" }]);
  return row.id;
}

for (const locale of ["fr-CA", "en-CA"]) {
  test(`host expels all account tabs with confirmation and persistent ban (${locale})`, async ({ browser }) => {
    const host = await browser.newContext({ locale, reducedMotion: "reduce" });
    const target = await browser.newContext({ locale, reducedMotion: "reduce" });
    try {
      await authenticate(host, "Moderation host");
      const targetId = await authenticate(target, "Moderation target");
      const page = await host.newPage();
      await page.goto("/rooms/new");
      await page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
      await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      const url = page.url();
      const member = await target.newPage();
      await member.goto(url);
      await member.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
      await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      const tab = await target.newPage(); await tab.goto(url);
      await expect(tab.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      await expect(member.getByRole("region", { name: /^(Modération de la salle|Room moderation)$/ })).toHaveCount(0);
      const panel = page.getByRole("region", { name: /^(Modération de la salle|Room moderation)$/ });
      const expel = panel.getByRole("button", { name: /^(Expulser|Expel) Moderation target$/ });
      await expect(expel).toBeVisible();
      await expel.click();
      const cancel = panel.getByRole("button", { name: /^(Annuler|Cancel)$/ });
      await expect(cancel).toBeFocused();
      await cancel.click();
      await expect(expel).toBeFocused();
      await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
      await expel.click();
      for (const colorScheme of ["light", "dark"] as const) {
        await page.emulateMedia({ colorScheme });
        await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme === "light" ? "aube" : "abysse");
        await page.evaluate(async () => { await Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))); });
        for (const width of [1440, 1024, 390, 360]) {
          await page.setViewportSize({ width, height: 1000 });
          await expectNoHorizontalScroll(page); await expectNoAccessibilityViolation(page);
          await page.screenshot({ path: test.info().outputPath(`${locale}-${colorScheme}-${width}.png`), fullPage: true });
        }
      }
      await panel.getByRole("button", { name: /^(Confirmer l’expulsion|Confirm expulsion)$/ }).click();
      await expect(panel.getByRole("status")).toHaveText(/^(Expulsion enregistrée\.|Expulsion saved\.)$/);
      await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toHaveCount(0);
      await expect(tab.getByText(/^\[\.(En direct|Live)\]$/)).toHaveCount(0);
      await expect.poll(async () => (await query<{ n: number }>("select count(*)::int n from lobby_bans where account_id=$1", [targetId]))[0]?.n).toBe(1);
      await member.reload();
      const join = member.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ });
      if (await join.isVisible()) await join.click();
      await expect(member.getByText(/^\[\.(En direct|Live)\]$/)).toHaveCount(0);
      expect((await query("select id from lobby_members where account_id=$1 and left_at is null", [targetId]))).toHaveLength(0);
      await expect(page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
    } finally { await host.close(); await target.close(); }
  });
}

for (const phase of ["waiting", "racing", "results"] as const) {
  test(`guest expulsion in ${phase} preserves its cookie deadline and prevents reentry`, async ({ browser }) => {
    test.setTimeout(90_000);
    const host = await browser.newContext({ locale: "en-CA" });
    const guest = await browser.newContext({ locale: "en-CA" });
    try {
      await authenticate(host, `Host ${phase}`);
      const page = await host.newPage(); await page.goto("/rooms/new");
      await page.getByRole("button", { name: "Open the room", exact: true }).click();
      await expect(page.getByText("[.Live]", { exact: true })).toBeVisible();
      const code = page.url().split("/").at(-1)!;
      await query("update lobby_settings set word_count=10 where lobby_id=(select id from lobbies where code=$1)", [code]);
      await page.reload();
      const member = await guest.newPage(); await member.goto(`/guest?code=${code}`);
      await member.getByLabel("Nickname for this room").fill("Guest target");
      await member.getByRole("button", { name: "Enter the room", exact: true }).click();
      await expect(member.getByText("[.Live]", { exact: true })).toBeVisible();
      const second = await guest.newPage(); await second.goto(page.url());
      await expect(second.getByText("[.Live]", { exact: true })).toBeVisible();
      const cookie = (await guest.cookies()).find((entry) => entry.name === "incision.guest");
      if (!cookie) throw new Error("Missing guest cookie");
      const guestId = cookie.value.split(".")[1];
      if (phase !== "waiting") {
        await page.getByRole("button", { name: "Start the race", exact: true }).click();
        await expect(member.getByLabel("Your typing", { exact: true })).toBeEnabled({ timeout: 10_000 });
        // Begin moderation against the racing phase, not the preceding countdown revision.
        await page.reload();
        await expect(page.getByLabel("Your typing", { exact: true })).toBeEnabled({ timeout: 10_000 });
      }
      if (phase === "results") {
        const text = (await member.locator(".course-texte").textContent()) ?? "";
        await Promise.all([member.getByLabel("Your typing", { exact: true }).pressSequentially(text, { delay: 70 }),
          page.getByLabel("Your typing", { exact: true }).pressSequentially(text, { delay: 70 })]);
        await expect(page.locator("#results-heading")).toBeVisible({ timeout: 15_000 });
      }
      const before = await query("select expires_at,last_seen_at from guest_sessions where id=$1", [guestId]);
      const resultsBefore = await query("select rr.* from race_results rr join races r on r.id=rr.race_id join lobbies l on l.id=r.lobby_id where l.code=$1 order by rr.entrant_id", [code]);
      const panel = page.getByRole("region", { name: "Room moderation", exact: true });
      await panel.getByRole("button", { name: "Expel Guest target", exact: true }).click();
      await panel.getByRole("button", { name: "Confirm expulsion", exact: true }).click();
      await expect(panel.getByRole("status")).toHaveText("Expulsion saved.");
      await expect.poll(async () => (await query("select id from lobby_members where guest_session_id=$1", [guestId])).length).toBe(0);
      await expect(member.getByText("[.Live]", { exact: true })).toHaveCount(0);
      await expect(second.getByText("[.Live]", { exact: true })).toHaveCount(0);
      await expect(member.getByRole("heading", { name: "Expelled from the room", exact: true })).toBeVisible();
      expect(await query("select expires_at,last_seen_at from guest_sessions where id=$1", [guestId])).toEqual(before);
      if (phase === "results") expect(await query("select rr.* from race_results rr join races r on r.id=rr.race_id join lobbies l on l.id=r.lobby_id where l.code=$1 order by rr.entrant_id", [code])).toEqual(resultsBefore);
      await member.goto(`/guest?code=${code}`);
      await member.getByLabel("Nickname for this room").fill("New nickname");
      await member.getByRole("button", { name: "Enter the room", exact: true }).click();
      await expect(member.locator("#guest-entry-error")).toBeVisible();
      expect((await guest.cookies()).find((entry) => entry.name === "incision.guest")?.value).toBe(cookie.value);
    } finally { await host.close(); await guest.close(); }
  });
}
