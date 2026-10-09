import { ROOM_CODE_ALPHABET } from "@incision/domain";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { type ForwardingProxy, startForwardingProxy } from "./forwarding-proxy";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

test.use({ locale: "fr-CA" });

const contexts: BrowserContext[] = [];
const proxies: ForwardingProxy[] = [];

test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});

test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map((context) => context.close()));
  await Promise.all(proxies.splice(0).map((proxy) => proxy.close()));
});

/** A client network: every request through it reaches the app from `peer`, as behind Azure. */
async function network(peer: string): Promise<string> {
  const proxy = await startForwardingProxy(test.info().project.use.baseURL ?? "", peer);
  proxies.push(proxy);
  return proxy.url;
}

/**
 * A new account of its own, signed in with a session cookie the server accepts. Each test uses
 * fresh accounts: the demo accounts are shared by every spec, and their per-account limits
 * (room changes, sign-ins) would couple the specs. The cookie also goes to the proxies
 * (cookies ignore ports).
 */
async function signedIn(browser: Browser, displayName: string, theme?: string): Promise<Page> {
  const [created] = await query<{ id: string; session_version: number }>(
    "insert into accounts (display_name) values ($1) returning id, session_version",
    [displayName],
  );
  if (created === undefined) {
    throw new Error("The account was not created");
  }
  const baseURL = test.info().project.use.baseURL ?? "";
  const context = await browser.newContext({ locale: "fr-CA" });
  contexts.push(context);
  const cookie = await forgeSessionCookie({ sub: created.id, sessionVersion: created.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: baseURL }]);
  if (theme !== undefined) {
    await context.addCookies([{ name: "theme", value: theme, url: baseURL }]);
  }
  return context.newPage();
}

async function createRoom(page: Page): Promise<string> {
  await page.goto("/rooms/new");
  await page.getByRole("button", { name: "Ouvrir la salle" }).click();
  await expect(page).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
  return page.url().split("/").at(-1) ?? "";
}

/** Codes of the right shape that no room uses (rooms get random codes; this prefix is never drawn twice in a run). */
function unknownCodes(count: number): string[] {
  const stamp = Date.now();
  return Array.from({ length: count }, (_, index) => {
    let value = stamp * 64 + index;
    let code = "";
    for (let position = 0; position < 6; position += 1) {
      code += ROOM_CODE_ALPHABET[value % ROOM_CODE_ALPHABET.length];
      value = Math.floor(value / ROOM_CODE_ALPHABET.length);
    }
    return code;
  });
}

/** Opens a room page through a client network and returns the server's title. */
async function titleOf(page: Page, via: string, code: string, headers: Record<string, string> = {}): Promise<string> {
  const response = await page.request.get(`${via}/rooms/${code}`, { headers });
  expect(response.status()).toBe(200);
  return /<title>([^<]*)<\/title>/.exec(await response.text())?.[1] ?? "";
}

const UNKNOWN = "Code introuvable · Incision";
const THROTTLED = "Trop d’essais · Incision";

test.describe("room-code attempts per address (SALLE-10)", () => {
  test("after 10 unknown codes, every code gets the same answer, which never names it", async ({ browser }) => {
    const openCode = await createRoom(await signedIn(browser, "Hôte"));
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.10");
    for (const code of unknownCodes(10)) {
      expect(await titleOf(page, via, code)).toBe(UNKNOWN);
    }
    // An open room's code now gets the same answer as any other code.
    expect(await titleOf(page, via, openCode)).toBe(THROTTLED);
    await page.goto(`${via}/rooms/${openCode}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trop d’essais");
    await expect(page.getByText("Trop de mauvais codes essayés depuis ce réseau. Réessaie dans une minute.")).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(openCode);
    await expect(page.getByRole("button", { name: "Rejoindre la salle" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Réessayer" })).toHaveAttribute("href", `/rooms/${openCode}`);
    // Another network is not affected.
    expect(await titleOf(page, await network("203.0.113.11"), openCode)).toBe(`Salle ${openCode} · Incision`);
  });

  test("views of an open room or of a race in progress never spend the budget", async ({ browser }) => {
    const openCode = await createRoom(await signedIn(browser, "Hôte"));
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.12");
    const codes = unknownCodes(11);
    for (const code of codes.slice(0, 9)) {
      await titleOf(page, via, code);
    }
    for (let index = 0; index < 5; index += 1) {
      expect(await titleOf(page, via, openCode)).toBe(`Salle ${openCode} · Incision`);
    }
    await query("update lobbies set phase = 'racing' where code = $1", [openCode]);
    for (let index = 0; index < 3; index += 1) {
      expect(await titleOf(page, via, openCode)).toBe(`Salle ${openCode} · Incision`);
    }
    expect(await titleOf(page, via, codes[9] ?? "")).toBe(UNKNOWN);
    expect(await titleOf(page, via, codes[10] ?? "")).toBe(THROTTLED);
  });

  test("a private room counts exactly like an unknown code", async ({ browser }) => {
    const privateCode = await createRoom(await signedIn(browser, "Hôte"));
    await query("update lobbies set visibility = 'private' where code = $1", [privateCode]);
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.13");
    const codes = unknownCodes(10);
    for (const code of codes.slice(0, 9)) {
      await titleOf(page, via, code);
    }
    expect(await titleOf(page, via, privateCode)).toBe(UNKNOWN);
    expect(await titleOf(page, via, codes[9] ?? "")).toBe(THROTTLED);
  });

  test("headers written by the client never choose the address that is counted", async ({ browser }) => {
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.14");
    const codes = unknownCodes(12);
    for (const [index, code] of codes.slice(0, 10).entries()) {
      // A different forged address on every request: still one network for the app.
      await titleOf(page, via, code, { "x-forwarded-for": `198.51.100.${index}`, "x-incision-client-address": `198.51.100.${index + 50}` });
    }
    expect(await titleOf(page, via, codes[10] ?? "", { "x-forwarded-for": "198.51.100.200" })).toBe(THROTTLED);
    // Pretending to come from the blocked network, from another one, changes nothing either.
    const other = await network("203.0.113.15");
    expect(await titleOf(page, other, codes[11] ?? "", { "x-forwarded-for": "203.0.113.14", "x-incision-client-address": "203.0.113.14" })).toBe(UNKNOWN);
  });

  test("the home field explains the refusal and keeps the focus", async ({ browser }) => {
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.16");
    const codes = unknownCodes(11);
    for (const code of codes.slice(0, 10)) {
      await titleOf(page, via, code);
    }
    await page.goto(`${via}/`);
    const field = page.getByLabel("Code de salle", { exact: true });
    await field.fill(codes[10] ?? "");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page.getByText("Trop de mauvais codes essayés depuis ce réseau. Réessaie dans une minute.")).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveAttribute("aria-invalid", "true");
  });

  test("a member still reaches their own room from the home field while their network is over budget", async ({ browser }) => {
    const host = await signedIn(browser, "Hôte");
    const ownCode = await createRoom(host);
    const via = await network("203.0.113.21");
    const codes = unknownCodes(11);
    for (const code of codes.slice(0, 10)) {
      await titleOf(host, via, code);
    }
    expect(await titleOf(host, via, codes[10] ?? "")).toBe(THROTTLED);
    await host.goto(`${via}/`);
    await host.getByLabel("Code de salle", { exact: true }).fill(ownCode);
    await host.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(host).toHaveURL(new RegExp(`/rooms/${ownCode}$`));
    await expect(host.getByRole("heading", { level: 1 })).toHaveText(/Salle d’attente/i);
  });

  test("30 accounts joining one room from the same network are all admitted and spend nothing", async ({ browser }) => {
    test.setTimeout(120_000);
    const host = await signedIn(browser, "Hôte");
    // The host watches, so the 30 participant places are all free (SALLE-05).
    await host.goto("/rooms/new");
    await host.getByLabel("Je participe à la course (sinon : spectateur)").uncheck();
    await host.getByRole("button", { name: "Ouvrir la salle" }).click();
    await expect(host).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
    const code = host.url().split("/").at(-1) ?? "";
    const via = await network("203.0.113.22");
    const students = await query<{ id: string; session_version: number }>(
      "insert into accounts (display_name) select 'Élève ' || n from generate_series(1, 30) as n returning id, session_version",
    );
    try {
      const authTime = Math.floor(Date.now() / 1000);
      const pages = await Promise.all(
        students.map(async (student) => {
          const context = await browser.newContext({ locale: "fr-CA" });
          contexts.push(context);
          const cookie = await forgeSessionCookie({ sub: student.id, sessionVersion: student.session_version, authTime });
          await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url: via }]);
          const page = await context.newPage();
          await page.goto(`${via}/rooms/${code}`);
          await expect(page.getByRole("button", { name: "Rejoindre la salle" })).toBeVisible();
          return page;
        }),
      );
      // Everyone clicks at once, as a class does.
      await Promise.all(pages.map((page) => page.getByRole("button", { name: "Rejoindre la salle" }).click()));
      for (const page of pages) {
        await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Salle d’attente/i, { timeout: 30_000 });
      }
      const [members] = await query<{ count: string }>(
        "select count(*) from lobby_members m join lobbies l on l.id = m.lobby_id where l.code = $1 and m.role = 'participant' and m.left_at is null",
        [code],
      );
      expect(Number(members?.count)).toBe(30);
      // The network's budget is untouched: 10 unknown codes are still answered.
      for (const unknown of unknownCodes(10)) {
        expect(await titleOf(host, via, unknown)).toBe(UNKNOWN);
      }
    } finally {
      // Their memberships go with the room; then the accounts can go.
      await query("update lobbies set host_member_id = null where code = $1", [code]);
      await query("delete from lobbies where code = $1", [code]);
      await query("delete from accounts where display_name like 'Élève %'");
    }
  });

  test("a member still opens their own room while their network is over budget", async ({ browser }) => {
    const host = await signedIn(browser, "Hôte");
    const ownCode = await createRoom(host);
    const via = await network("203.0.113.17");
    const codes = unknownCodes(11);
    for (const code of codes.slice(0, 10)) {
      await titleOf(host, via, code);
    }
    expect(await titleOf(host, via, codes[10] ?? "")).toBe(THROTTLED);
    await host.goto(`${via}/rooms/${ownCode}`);
    await expect(host.getByRole("heading", { level: 1 })).toHaveText(/Salle d’attente/i);
  });

  test("over budget, every code typed gets the network's answer and the account keeps its room changes", async ({ browser }) => {
    const openCode = await createRoom(await signedIn(browser, "Hôte"));
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.23");
    const codes = unknownCodes(21);
    for (const code of codes.slice(0, 10)) {
      await titleOf(page, via, code);
    }
    await page.goto(`${via}/`);
    const field = page.getByLabel("Code de salle", { exact: true });
    for (const code of [...codes.slice(10), openCode]) {
      await field.fill(code);
      // The answer has arrived and been drawn once the button reads "Rejoindre la salle" again.
      await Promise.all([
        page.waitForResponse((response) => response.request().method() === "POST"),
        page.getByRole("button", { name: "Rejoindre la salle" }).click(),
      ]);
      await expect(page.getByRole("button", { name: "Rejoindre la salle" })).toBeVisible();
      await expect(page.getByText("Trop de mauvais codes essayés depuis ce réseau. Réessaie dans une minute.")).toBeVisible();
    }
    await expect(page.getByText("Trop de changements de salle d’affilée. Réessaie dans une minute.")).toHaveCount(0);
    // From another network, the account still joins: none of its 10 room changes was spent.
    const other = await network("203.0.113.24");
    await page.goto(`${other}/rooms/${openCode}`);
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Salle d’attente/i);
  });

  test("a code typed in lower case counts once, though the page redirects it", async ({ browser }) => {
    const page = await signedIn(browser, "Visiteur");
    const via = await network("203.0.113.25");
    const codes = unknownCodes(11).map((code) => code.toLowerCase());
    for (const code of codes.slice(0, 10)) {
      expect(await titleOf(page, via, code)).toBe(UNKNOWN);
    }
    expect(await titleOf(page, via, codes[10] ?? "")).toBe(THROTTLED);
  });

  for (const theme of ["abysse", "aube"] as const) {
    test(`the refusal page is accessible and fits 360 px in ${theme}`, async ({ browser }) => {
      const page = await signedIn(browser, "Visiteur", theme);
      const via = await network(theme === "abysse" ? "203.0.113.18" : "203.0.113.19");
      const codes = unknownCodes(11);
      for (const code of codes.slice(0, 10)) {
        await titleOf(page, via, code);
      }
      await page.goto(`${via}/rooms/${codes[10] ?? ""}`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Trop d’essais");
      await expectNoAccessibilityViolation(page);
      await page.setViewportSize({ width: 360, height: 780 });
      await expectNoHorizontalScroll(page);
    });
  }

  test("speaks English to an English interface", async ({ browser }) => {
    const page = await signedIn(browser, "Visiteur");
    await page.context().addCookies([{ name: "locale", value: "en", url: test.info().project.use.baseURL ?? "" }]);
    const via = await network("203.0.113.20");
    const codes = unknownCodes(11);
    for (const code of codes.slice(0, 10)) {
      await titleOf(page, via, code);
    }
    await page.goto(`${via}/rooms/${codes[10] ?? ""}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Too many tries");
    await expect(page.getByText("Too many wrong codes tried from this network. Try again in a minute.")).toBeVisible();
  });
});
