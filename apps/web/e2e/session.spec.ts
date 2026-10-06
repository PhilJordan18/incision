import { hashPassword } from "@incision/database";
import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import { connectSocket, FRENCH, forgeSessionCookie, query, SESSION_COOKIE, sessionCookieHeader, signInWithCredentials } from "./support";

const [, bruno] = DEMO_ACCOUNTS;
if (bruno === undefined) {
  throw new Error("No second demo account");
}

test.use({ locale: "fr-CA" });

test.describe("protected access (SEC-01, server-side)", () => {
  test("redirects an anonymous visitor to sign-in, then back to the protected page", async ({ page }) => {
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Faccount$/);
    await page.getByLabel(FRENCH.login).fill(bruno.login);
    await page.getByLabel("Mot de passe").fill(bruno.password);
    await page.getByRole("button", { name: "Se connecter", exact: true }).click();
    await expect(page).toHaveURL(/\/account$/);
    await expect(page.getByText(bruno.displayName)).toBeVisible();
  });

  test("exposes only the account id and the session end, in an HttpOnly cookie", async ({ page, context, request }) => {
    expect(await (await request.get("/api/auth/session")).json()).toBeNull();
    await signInWithCredentials(page, bruno.login, bruno.password);
    await expect(page).toHaveURL(/\/account$/);
    const cookie = (await context.cookies()).find((candidate) => candidate.name === SESSION_COOKIE);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
    const session: unknown = await page.evaluate(async () => (await fetch("/api/auth/session")).json());
    expect(session).toEqual({ user: { id: expect.stringMatching(/^[0-9a-f-]{36}$/) }, expires: expect.any(String) });
    expect(JSON.stringify(session)).not.toMatch(/mail|name|image|token/i);
  });

  test("keeps anonymous sockets out of protected events", async ({ baseURL }) => {
    const { socket, error } = await connectSocket(baseURL ?? "");
    expect(error).toBeUndefined();
    expect(await socket.timeout(5_000).emitWithAck("session:whoami", {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
    socket.close();
  });
});

test.describe("sign-out ends every session of the account (option B)", () => {
  test("closes the other browser's sockets and refuses every copy of the old cookie", async ({ browser, baseURL }) => {
    const origin = baseURL ?? "";
    const laptop = await browser.newContext({ locale: "fr-CA" });
    const phone = await browser.newContext({ locale: "fr-CA" });
    const [laptopPage, phonePage] = [await laptop.newPage(), await phone.newPage()];
    await signInWithCredentials(laptopPage, bruno.login, bruno.password);
    await signInWithCredentials(phonePage, bruno.login, bruno.password);
    await expect(phonePage).toHaveURL(/\/account$/);
    const laptopCookie = await sessionCookieHeader(laptop);
    const phoneCookie = await sessionCookieHeader(phone);

    // One socket per device, both authenticated as the same account.
    const laptopSocket = await connectSocket(origin, laptopCookie);
    const phoneSocket = await connectSocket(origin, phoneCookie);
    const accountAck = await phoneSocket.socket.timeout(5_000).emitWithAck("session:whoami", {});
    expect(accountAck).toMatchObject({ ok: true });
    expect(await laptopSocket.socket.timeout(5_000).emitWithAck("session:whoami", {})).toEqual(accountAck);
    const phoneClosed = new Promise<string>((resolve) => phoneSocket.socket.once("disconnect", resolve));
    const laptopClosed = new Promise<string>((resolve) => laptopSocket.socket.once("disconnect", resolve));

    // Signing out on the laptop (a Next.js server action) closes the sockets held by
    // the custom Socket.IO server: both use the same process-wide registry.
    await laptopPage.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(laptopPage).toHaveURL(new RegExp(`^${origin}/$`));
    expect(await phoneClosed).toBe("io server disconnect");
    expect(await laptopClosed).toBe("io server disconnect");

    // The phone's cookie, never deleted from its browser, no longer opens anything.
    await phonePage.goto("/account");
    await expect(phonePage).toHaveURL(/\/sign-in/);
    for (const oldCookie of [laptopCookie, phoneCookie]) {
      const replay = await connectSocket(origin, oldCookie);
      expect(replay.error).toBe("UNAUTHORIZED");
      replay.socket.close();
    }
    await laptop.close();
    await phone.close();
  });

  test("refuses an old cookie put back after sign-out, on HTTP and Socket.IO", async ({ page, context, baseURL }) => {
    await signInWithCredentials(page, bruno.login, bruno.password);
    await expect(page).toHaveURL(/\/account$/);
    const cookie = await sessionCookieHeader(context);
    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await expect(page).toHaveURL(new RegExp(`^${baseURL ?? ""}/$`));

    await context.addCookies([{ name: SESSION_COOKIE, value: cookie.slice(SESSION_COOKIE.length + 1), url: baseURL ?? "" }]);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);
    const replay = await connectSocket(baseURL ?? "", cookie);
    expect(replay.error).toBe("UNAUTHORIZED");
    replay.socket.close();
  });
});

test.describe("refused cookies", () => {
  test("refuses a tampered cookie on HTTP and Socket.IO", async ({ page, context, baseURL }) => {
    await signInWithCredentials(page, bruno.login, bruno.password);
    await expect(page).toHaveURL(/\/account$/);
    const value = (await sessionCookieHeader(context)).slice(SESSION_COOKIE.length + 1);
    const tampered = `${value.slice(0, -6)}AAAAAA`;
    await context.addCookies([{ name: SESSION_COOKIE, value: tampered, url: baseURL ?? "" }]);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);
    const attempt = await connectSocket(baseURL ?? "", `${SESSION_COOKIE}=${tampered}`);
    expect(attempt.error).toBe("UNAUTHORIZED");
    attempt.socket.close();
  });

  test("refuses a session signed in more than 24 hours ago", async ({ page, context, baseURL }) => {
    const [account] = await query<{ id: string; session_version: number }>(
      "select id, session_version from accounts where login_canonical = $1",
      [bruno.login],
    );
    const dayAndAMinuteAgo = Math.floor(Date.now() / 1000) - 24 * 3600 - 60;
    const expired = await forgeSessionCookie({ sub: account?.id, sessionVersion: account?.session_version, authTime: dayAndAMinuteAgo });
    await context.addCookies([{ name: SESSION_COOKIE, value: expired, url: baseURL ?? "" }]);
    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);
    const attempt = await connectSocket(baseURL ?? "", `${SESSION_COOKIE}=${expired}`);
    expect(attempt.error).toBe("UNAUTHORIZED");
    attempt.socket.close();
  });

  test("refuses the session of a deleted account", async ({ page, context, baseURL }) => {
    // A throwaway account, so the demo accounts stay available.
    const login = `deleted-${Date.now()}`;
    await query("insert into accounts (login, login_canonical, display_name, password_hash) values ($1, $1, 'Temporary', $2)", [
      login,
      await hashPassword("temporary-password"),
    ]);
    await signInWithCredentials(page, login, "temporary-password");
    await expect(page).toHaveURL(/\/account$/);
    const cookie = await sessionCookieHeader(context);
    await query("delete from accounts where login_canonical = $1", [login]);

    await page.goto("/account");
    await expect(page).toHaveURL(/\/sign-in/);
    const attempt = await connectSocket(baseURL ?? "", cookie);
    expect(attempt.error).toBe("UNAUTHORIZED");
    attempt.socket.close();
  });
});
