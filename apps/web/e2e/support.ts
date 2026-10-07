import { type BrowserContext, expect, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import pg from "pg";
import { io, type Socket } from "socket.io-client";

/** Auth.js' session cookie over plain HTTP (the E2E server runs on localhost). */
export const SESSION_COOKIE = "authjs.session-token";

type FormLabels = { readonly login: string; readonly password: string; readonly submit: string };

export async function signInWithCredentials(page: Page, login: string, password: string, labels: FormLabels = FRENCH): Promise<void> {
  await page.goto("/sign-in");
  await page.getByLabel(labels.login).fill(login);
  await page.getByLabel(labels.password).fill(password);
  await page.getByRole("button", { name: labels.submit, exact: true }).click();
}

export const FRENCH: FormLabels = { login: "Identifiant", password: "Mot de passe", submit: "Se connecter" };
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
