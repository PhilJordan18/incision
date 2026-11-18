import { randomUUID } from "node:crypto";
import { asDuration, computeMeasures } from "@incision/domain";
import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/** Synthetic accounts and races on the disposable E2E database only (DA2-7 checks and captures). */
export type Sailor = { readonly context: BrowserContext; readonly page: Page; readonly accountId: string };

export async function sailor(browser: Browser, name: string, options: Parameters<Browser["newContext"]>[0] = {}): Promise<Sailor> {
  const [account] = await query<{ id: string; session_version: number }>(
    "insert into accounts(display_name) values ($1) returning id, session_version", [name]);
  if (!account) throw new Error("Missing fixture account");
  const context = await browser.newContext({ locale: "fr-CA", reducedMotion: "reduce", viewport: { width: 1440, height: 900 }, ...options });
  await context.addCookies([{ name: SESSION_COOKIE, url: test.info().project.use.baseURL!, value: await forgeSessionCookie({
    sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000),
  }) }]);
  return { context, page: await context.newPage(), accountId: account.id };
}

export async function setTheme(context: BrowserContext, theme: "abysse" | "aube"): Promise<void> {
  await context.addCookies([{ name: "theme", value: theme, url: test.info().project.use.baseURL! }]);
}

export async function setLocale(context: BrowserContext, locale: "fr" | "en"): Promise<void> {
  await context.addCookies([{ name: "locale", value: locale, url: test.info().project.use.baseURL! }]);
}

type SeedEntrant = {
  readonly name: string;
  readonly kind: "human" | "bot" | "guest";
  readonly accountId?: string;
  readonly botLevel?: string;
  readonly outcome: "finished" | "timed_out" | "abandoned";
  readonly elapsed: number;
  readonly errors: number;
  readonly journal?: unknown;
};

/**
 * A finished race frozen in the database, with stored speed series, a bonus journal and the
 * reader's own missed characters: what `/races/[id]` shows. Returns the entrants' ids by ordinal.
 */
export async function seedRace(entrants: readonly SeedEntrant[], options: { readonly round?: number; readonly endedAt?: string } = {}) {
  const id = randomUUID();
  const endedAt = options.endedAt ?? "2026-11-17T23:41:00Z";
  await query(`insert into races(id,round_no,state,rules_version,text_snapshot,config_snapshot,
    countdown_at,started_at,ended_at,owner_id,lease_expires_at)
    values ($1,$2,'finished',1,'sea','{"bonuses":true,"errorMode":"mandatory"}',
    $3::timestamptz - interval '2 minutes',$3::timestamptz - interval '117 seconds',$3,$1,$3::timestamptz + interval '1 minute')`,
  [id, options.round ?? 1, endedAt]);
  const entrantIds: string[] = [];
  for (const [index, entrant] of entrants.entries()) {
    const [row] = await query<{ id: string }>(`insert into race_entrants(race_id,account_id,ordinal,display_name_snapshot,kind,bot_level)
      values ($1,$2,$3,$4,$5,$6) returning id`, [id, entrant.accountId ?? null, index + 1, entrant.name, entrant.kind, entrant.botLevel ?? null]);
    entrantIds.push(row!.id);
    const length = 120;
    const position = entrant.outcome === "finished" ? length : Math.round(length * 0.6);
    const points = [0, 0.2, 0.45, 0.7, 1].map((share) => {
      const counters = { correctInserts: Math.round(position * share), totalInserts: Math.round((position + entrant.errors) * share) };
      const elapsed = Math.round(entrant.elapsed * share);
      return { elapsed, counters, measures: computeMeasures(counters, asDuration(elapsed)) };
    });
    const last = points.at(-1)!;
    await query(`insert into race_results(race_id,entrant_id,outcome,rank,elapsed_ms,position,length,
      correct_inputs,total_inputs,net_wpm,raw_wpm,accuracy,abandonment_reason,bonus_journal)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [id, row!.id, entrant.outcome, index + 1, entrant.elapsed, position, length, last.counters.correctInserts, last.counters.totalInserts,
      last.measures.netWpm, last.measures.rawWpm, last.measures.accuracy, entrant.outcome === "abandoned" ? "voluntary" : null, entrant.journal ?? null]);
    await query("insert into race_wpm_series(race_id,entrant_id,series) values($1,$2,$3)", [id, row!.id, { version: 1, spacingMs: 1000, points }]);
    if (entrant.errors > 0) {
      const keys = [{ grapheme: "é", count: Math.ceil(entrant.errors / 2) }, { grapheme: "u", count: Math.floor(entrant.errors / 2) }].filter((key) => key.count > 0);
      await query("insert into race_key_errors(race_id,entrant_id,aggregate) values($1,$2,$3)", [id, row!.id, { version: 1, keys }]);
    }
  }
  return { id, entrantIds };
}

/** Five entrants: the reader, another account, two bots and an anonymous guest; arrivals, a time-out and an abandon. */
export function crew(selfId: string, otherId: string): readonly SeedEntrant[] {
  return [
    { name: "Lina", kind: "human", accountId: otherId, outcome: "finished", elapsed: 58_200, errors: 4, journal: { version: 1, grants: [] } },
    { name: "Capitaine", kind: "human", accountId: selfId, outcome: "finished", elapsed: 64_600, errors: 5,
      journal: { version: 1, grants: [{ kind: "shortenSelf", milestone: 25, activation: { targetOrdinal: 1, atMs: 21_480 } }, { kind: "fogLeader", milestone: 50 }] } },
    { name: "Bot 1", kind: "bot", botLevel: "intermediate", outcome: "finished", elapsed: 69_000, errors: 0, journal: { version: 1, grants: [] } },
    { name: "#4", kind: "guest", outcome: "timed_out", elapsed: 120_000, errors: 9 },
    { name: "Bot 2", kind: "bot", botLevel: "noob", outcome: "abandoned", elapsed: 120_000, errors: 0, journal: { version: 1, grants: [] } },
  ];
}

/**
 * A real room taken to its results by the real server: the host, a second account and one bot.
 * Both humans give up; the bot finishes on its own. Returns the room's code and race id.
 */
export async function roomResults(host: Sailor, guest: Sailor): Promise<{ readonly code: string; readonly raceId: string }> {
  await query("update lobbies set host_member_id=null"); await query("delete from lobbies");
  await host.page.goto("/rooms/new");
  await host.page.getByRole("button", { name: /^(Ouvrir la salle|Open the room)$/ }).click();
  await expect(host.page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  const code = host.page.url().split("/").at(-1)!;
  await guest.page.goto(`/rooms/${code}`);
  await guest.page.getByRole("button", { name: /^(Rejoindre la salle|Join the room)$/ }).click();
  await expect(guest.page.getByText(/^\[\.(En direct|Live)\]$/)).toBeVisible();
  const bots = host.page.getByRole("region", { name: "Bots", exact: true });
  await bots.getByRole("combobox").first().selectOption("impossible");
  await bots.getByRole("button", { name: /^(Ajouter un bot|Add a bot)$/ }).click();
  await expect(bots.getByRole("listitem")).toHaveCount(1);
  const start = host.page.getByRole("button", { name: /^(Lancer la course|Start the race)$/ });
  await expect(start).toBeEnabled(); await start.click();
  for (const { page } of [host, guest]) await expect(page.getByLabel(/^(Ta frappe|Your typing)$/)).toBeEnabled({ timeout: 15_000 });
  return { code, raceId: (await query<{ id: string }>("select current_race_id as id from lobbies where code=$1", [code]))[0]!.id };
}

export async function giveUp(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^(Abandonner la course|Give up the race)$/ }).click();
  await page.getByRole("button", { name: /^(Oui, abandonner|Yes, give up)$/ }).click();
}

export async function expectResults(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { level: 1 })).toContainText(/Fin de la|End of the/i, { timeout: 30_000 });
}
