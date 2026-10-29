import { expect, test } from "@playwright/test";
import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { connectSocket, query, signInWithCredentials } from "./support";

const COOKIE = "incision.guest";
test.use({ locale: "fr-CA" });

test("guest cookie is HttpOnly, stable across tabs and GET does not renew it", async ({ page, context, baseURL }) => {
  await page.goto("/");
  const start = await context.request.post("/api/guest/session", { headers: { Origin: baseURL ?? "" }, data: { nickname: "  Ｅva  " } });
  expect(start.status()).toBe(200);
  expect(await start.json()).toEqual({ ok: true, status: "guest", nickname: "Eva" });
  const cookie = (await context.cookies()).find((value) => value.name === COOKIE);
  expect(cookie).toMatchObject({ httpOnly: true, path: "/", sameSite: "Lax", secure: false });
  expect(await page.evaluate(() => document.cookie)).not.toContain(COOKIE);
  const id = cookie?.value.split(".")[1];
  const before = await query("select expires_at from guest_sessions where id=$1", [id]);
  const get = await context.request.get("/api/guest/session");
  expect(get.status()).toBe(200);
  expect(get.headers()["set-cookie"]).toBeUndefined();
  expect(await query("select expires_at from guest_sessions where id=$1", [id])).toEqual(before);
  const other = await context.newPage(); await other.goto("/");
  const renew = (tab: typeof page) => tab.evaluate(async () => (await fetch("/api/guest/session/renew", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  expect(await Promise.all([renew(page), renew(other)])).toEqual([200, 200]);
  expect((await context.cookies()).find((value) => value.name === COOKIE)?.value).toBe(cookie?.value);
  await other.close();
});

test("forged, expired and malformed cookies cannot be renewed or implicitly replaced", async ({ context, baseURL }) => {
  const origin = baseURL ?? "";
  await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Guest" } });
  const cookie = (await context.cookies()).find((value) => value.name === COOKIE);
  if (!cookie) throw new Error("Missing guest cookie");
  const id = cookie.value.split(".")[1];
  await query("update guest_sessions set created_at=now()-interval '2 days', last_seen_at=now()-interval '25 hours', expires_at=now()-interval '1 hour' where id=$1", [id]);
  for (const value of [cookie.value, `${cookie.value}x`, "malformed"]) {
    await context.addCookies([{ name: COOKIE, value, url: origin, httpOnly: true }]);
    const response = await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Guest" } });
    expect(response.status()).toBe(401);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});

test("guest credentials grant no account, room or race access", async ({ page, context, baseURL }) => {
  const origin = baseURL ?? "";
  expect((await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Visitor" } })).status()).toBe(200);
  expect(await (await context.request.get("/api/auth/session")).json()).toBeNull();
  for (const path of ["/account", "/history", "/rooms/new", "/races/00000000-0000-4000-8000-000000000001"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/sign-in/);
  }
  expect((await context.request.post("/api/account/photo", { headers: { Origin: origin }, multipart: {} })).status()).toBe(401);
  const cookie = (await context.cookies()).find((value) => value.name === COOKIE);
  const { socket } = await connectSocket(origin, `${COOKIE}=${cookie?.value ?? ""}`);
  try {
    expect(await socket.timeout(5000).emitWithAck("session:whoami", {})).toEqual({ ok: false, error: "UNAUTHORIZED" });
    expect(await socket.timeout(5000).emitWithAck("room:watch", { code: "ABCDEF" })).toEqual({ ok: false, error: "UNAUTHORIZED" });
  } finally { socket.close(); }
});

test("a valid account takes precedence without merging or renewing its old guest identity", async ({ page, context, baseURL }) => {
  const origin = baseURL ?? "";
  await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Visitor" } });
  const guest = (await context.cookies()).find((value) => value.name === COOKIE);
  const before = await query("select * from guest_sessions where id=$1", [guest?.value.split(".")[1]]);
  const account = DEMO_ACCOUNTS[0];
  if (!account) throw new Error("Missing fixture account");
  await signInWithCredentials(page, account.login, account.password);
  await expect(page).toHaveURL(/\/account$/);
  const response = await context.request.post("/api/guest/session/renew", { headers: { Origin: origin }, data: {} });
  expect(response.status()).toBe(409);
  expect(await query("select * from guest_sessions where id=$1", [guest?.value.split(".")[1]])).toEqual(before);
  await expect(page).toHaveURL(/\/account$/);
});

test("cross-origin and missing-origin mutations are refused", async ({ context, baseURL }) => {
  const origins: Record<string, string>[] = [{ Origin: "https://other.example" }, { Origin: "null" }, {}];
  for (const headers of origins) {
    const response = await context.request.post(`${baseURL}/api/guest/session`, { headers, data: { nickname: "Visitor" } });
    expect(response.status()).toBe(403);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
});

test("malformed account chunks cannot fall back to a valid guest", async ({ context, baseURL }) => {
  const origin = baseURL ?? "";
  expect((await context.request.post("/api/guest/session", { headers: { Origin: origin }, data: { nickname: "Visitor" } })).status()).toBe(200);
  await context.addCookies([{ name: "authjs.session-token.bad", value: "malformed", url: origin, httpOnly: true }]);
  const response = await context.request.post("/api/guest/session/renew", { headers: { Origin: origin }, data: {} });
  expect(response.status()).toBe(401);
  expect(response.headers()["set-cookie"]).toBeUndefined();
});
