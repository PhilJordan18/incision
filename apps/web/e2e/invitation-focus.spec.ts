import { expect, test } from "@playwright/test";
import { forgeSessionCookie, query, SESSION_COOKIE } from "./support";

for (const locale of ["fr-CA", "en-US"]) for (const activation of ["keyboard", "mouse"]) test(`invitation refusal focuses its committed alert without waiting for a frame (${locale}, ${activation})`, async ({ browser, baseURL }) => {
  const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values('Invitation focus') returning id,session_version");
  if (!account) throw new Error("Missing synthetic account");
  const context = await browser.newContext({ locale, reducedMotion: "reduce" });
  try {
    await context.addCookies([{ name: SESSION_COOKIE, url: baseURL ?? "", value: await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) }) }]);
    const page = await context.newPage();
    await page.goto(`/invite#${"A".repeat(43)}`);
    const submit = page.getByRole("button", { name: /^(Rejoindre avec mon compte|Join with my account)$/ });
    await expect(submit).toBeVisible();
    // Browser frames can be delayed in background tabs. Network/React commits still finish.
    // Freezing the browser clock makes the old one-shot requestAnimationFrame focus fail deterministically.
    const time = new Date();
    await page.clock.install({ time }); await page.clock.pauseAt(new Date(time.getTime() + 60_000));
    if (activation === "keyboard") { await submit.focus(); await submit.press("Enter"); }
    else await submit.click();
    const alert = page.locator('p[role="alert"]');
    await expect(alert).toBeVisible(); await expect(alert).toBeFocused();
    if (activation === "keyboard") expect(await alert.evaluate(element => getComputedStyle(element).outlineStyle)).not.toBe("none");
  } finally { await context.close(); }
});
