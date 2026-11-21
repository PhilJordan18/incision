import AxeBuilder from "@axe-core/playwright";
import { type BrowserContext, expect, type Locator, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { io, type Socket } from "socket.io-client";

/** Auth.js' session cookie over plain HTTP (the E2E server runs on localhost). */
export const SESSION_COOKIE = "authjs.session-token";

type FormLabels = { readonly login: string; readonly password: string; readonly submit: string };

export async function signInWithCredentials(page: Page, login: string, password: string, labels: FormLabels = FRENCH): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(labels.login, { exact: true }).fill(login);
  await page.getByLabel(labels.password, { exact: true }).fill(password);
  await page.getByRole("button", { name: labels.submit, exact: true }).click();
}

export const FRENCH: FormLabels = { login: "Nom d’utilisateur", password: "Mot de passe", submit: "Se connecter" };
export const ENGLISH: FormLabels = { login: "Username", password: "Password", submit: "Sign in" };

/** The session cookie as a Cookie header, as a browser would send it on a later request. */
export async function sessionCookieHeader(context: BrowserContext): Promise<string> {
  const cookie = (await context.cookies()).find((candidate) => candidate.name === SESSION_COOKIE);
  expect(cookie, "session cookie").toBeDefined();
  return `${SESSION_COOKIE}=${cookie?.value ?? ""}`;
}

export type SocketAttempt = { readonly socket: Socket; readonly error?: string };

/** Opens a Socket.IO connection from the site's origin, with an optional Cookie header. */
export function connectSocket(baseURL: string, cookie?: string): Promise<SocketAttempt> {
  return new Promise((resolve) => {
    const socket = io(baseURL, {
      transports: ["websocket"],
      reconnection: false,
      timeout: 5_000,
      extraHeaders: { origin: baseURL, ...(cookie === undefined ? {} : { cookie }) },
    });
    socket.once("connect", () => resolve({ socket }));
    socket.once("connect_error", (error) => resolve({ socket, error: error.message }));
  });
}

/** A session cookie encrypted with the server's secret: valid shape, any claims. */
export async function forgeSessionCookie(claims: Record<string, unknown>): Promise<string> {
  const secret = process.env.E2E_AUTH_SECRET;
  if (secret === undefined) {
    throw new Error("E2E_AUTH_SECRET is set by playwright.config.ts");
  }
  return encode({ token: claims, secret, salt: SESSION_COOKIE });
}

/** Runs one statement on the E2E database (fixtures only). */
export async function query<Row extends pg.QueryResultRow>(sql: string, values: unknown[] = []): Promise<Row[]> {
  const client = new pg.Client({ connectionString: process.env.E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<Row>(sql, values)).rows;
  } finally {
    await client.end();
  }
}

/** WCAG 2.1 A and AA rules, contrast included (A11Y-01 to A11Y-04, DA p.26). */
export async function expectNoAccessibilityViolation(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(results.violations.map(({ id, nodes }) => `${id}: ${nodes.map((node) => node.target.join(" ")).join(", ")}`)).toEqual([]);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/**
 * What `page` sends to its race, in order: each grapheme inserted, and ⌫ for Backspace. Read from
 * the socket's `race:batch` frames, a batch sent again counted once. Install before the page loads.
 */
export function sentKeystrokes(page: Page): () => string[] {
  const batches = new Map<number, string[]>();
  page.on("websocket", socket => socket.on("framesent", ({ payload }) => {
    const packet = /^42\d*(\[[\s\S]*\])$/.exec(String(payload));
    if (packet === null) return;
    const [event, batch] = JSON.parse(packet[1]!) as [string, { seq?: number; events?: { type: string; grapheme?: string }[] }];
    if (event !== "race:batch" || batch.seq === undefined || batch.events === undefined) return;
    batches.set(batch.seq, batch.events.map(keystroke => keystroke.type === "insert" ? keystroke.grapheme ?? "" : keystroke.type === "deleteBackward" ? "⌫" : keystroke.type));
  }));
  return () => [...batches.entries()].sort(([a], [b]) => a - b).flatMap(([, keystrokes]) => keystrokes);
}

/**
 * The browser events around the macOS accent menu, synthetic: `key` held (the browser inserts it),
 * selected by the OS, released, then replaced by `replacement`. Proves the page's handling only, not
 * the OS menu itself. Returns whether the page cancelled the replacement.
 */
export async function holdForAccent(page: Page, field: Locator, key: string, replacement: string): Promise<boolean> {
  await page.keyboard.down(key);
  await field.evaluate(element => (element as HTMLInputElement).select());
  await page.keyboard.up(key);
  return field.evaluate((element, data) => !element.dispatchEvent(new InputEvent("beforeinput", {
    inputType: "insertReplacementText", data, bubbles: true, cancelable: true,
  })), replacement);
}
