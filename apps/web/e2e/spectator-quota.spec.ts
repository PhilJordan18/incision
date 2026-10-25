import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

for (const locale of ["fr-CA", "en-US"] as const) {
  for (const theme of ["abysse", "aube"] as const) {
    test(`spectator quota refusal and retry: ${locale}, ${theme}`, async ({ browser, baseURL }) => {
      const accounts = await query<{ id: string; session_version: number }>(
        "insert into accounts (display_name) values ('Quota host'), ('Quota visitor') returning id, session_version",
      );
      const host = accounts[0];
      const visitor = accounts[1];
      if (!host || !visitor) throw new Error("Missing fixture accounts");
      const hostContext = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
      const visitorContext = await browser.newContext({ locale, viewport: { width: 1440, height: 900 } });
      try {
        for (const [context, account] of [[hostContext, host], [visitorContext, visitor]] as const) {
          const cookie = await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) });
          await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL ?? "" }, { name: "theme", value: theme, url: baseURL ?? "" }]);
        }
        const hostPage = await hostContext.newPage();
        await hostPage.goto(`${baseURL}/rooms/new`);
        await hostPage.getByRole("checkbox").check();
        await hostPage.getByRole("button", { name: /^(Open the room|Ouvrir la salle)$/ }).click();
        await expect(hostPage).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
        const code = hostPage.url().split("/").at(-1);
        const [room] = await query<{ id: string }>("select id from lobbies where code=$1", [code]);
        if (!room) throw new Error("Missing fixture room");
        // Occupancy fixture only: SQL tests separately exercise all admissions/concurrency.
        await query(`with spectators as (
          insert into accounts (display_name) select 'Quota spectator ' || n from generate_series(1,20) n returning id, display_name
        ) insert into lobby_members (lobby_id, account_id, role, display_name, display_name_canonical)
          select $1, id, 'spectator', display_name, lower(display_name) from spectators`, [room.id]);
        const page = await visitorContext.newPage();
        await page.goto(`${baseURL}/rooms/${code}`);
        await page.getByRole("checkbox").uncheck();
        const join = page.getByRole("button", { name: /^(Join the room|Rejoindre la salle)$/ });
        await join.focus();
        await page.keyboard.press("Enter");
        const message = locale === "fr-CA"
          ? "Cette salle accueille déjà 20 spectateurs. Réessaie lorsqu’une place se libère."
          : "This room already has 20 spectators. Try again when a place becomes available.";
        await expect(page.getByRole("alert")).toContainText(message);
        expect(await query("select id from lobby_members where account_id=$1 and left_at is null", [visitor.id])).toHaveLength(0);
        for (const width of [1440, 1024, 390, 360]) {
          await page.setViewportSize({ width, height: 900 });
          await expectNoHorizontalScroll(page);
          await expect(page.getByText(message, { exact: true })).toBeVisible();
          if (width === 360) await expectNoAccessibilityViolation(page);
          else await page.screenshot({ path: test.info().outputPath(`quota-${width}.png`) });
        }
        // Release exactly one fixture membership; the browser then performs real admission.
        await query("update lobby_members set left_at=now() where id=(select id from lobby_members where lobby_id=$1 and role='spectator' and left_at is null limit 1)", [room.id]);
        await join.click();
        await expect(page.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
        await page.reload();
        await expect(page.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
        expect(await query("select id from lobby_members where account_id=$1 and left_at is null", [visitor.id])).toHaveLength(1);
        const [count] = await query<{ value: number }>("select count(*)::int as value from lobby_members where lobby_id=$1 and role='spectator' and left_at is null", [room.id]);
        expect(count?.value).toBe(20);
      } finally {
        await visitorContext.close();
        await hostContext.close();
      }
    });
  }
}
