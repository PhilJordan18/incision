import { chromium } from "@playwright/test";
import { summary } from "./metrics";

export interface BrowserReport {
  passed: boolean;
  mode: string;
  additionalSockets: number;
  viewport: { width: number; height: number };
  locale: string;
  theme: string;
  durationMs: number;
  minRunners: number;
  runners: number;
  distinctPositions: number;
  frameIntervalsMs: ReturnType<typeof summary>;
  longTasksMs: ReturnType<typeof summary>;
  pageErrors: number;
  resultsVisible: boolean;
}

/** An extra tab of an existing spectator, never an extra member or racing participant. */
export async function openBrowser(input: { origin: string; cookie: string; code: string }) {
  if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(input.origin)) throw new Error("Non-local browser target");
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ locale: "fr-CA", viewport: { width: 1440, height: 1000 }, reducedMotion: "no-preference" });
    await context.addCookies([
      { name: "authjs.session-token", value: input.cookie.slice("authjs.session-token=".length), url: input.origin },
      { name: "theme", value: "abysse", url: input.origin },
    ]);
    const page = await context.newPage();
    let pageErrors = 0;
    page.on("pageerror", () => { pageErrors++; });
    await page.goto(`${input.origin}/rooms/${input.code}`);
    await page.getByText("[.En direct]", { exact: true }).waitFor();
    return {
      async sample() {
        await page.getByTestId("race-track").waitFor({ timeout: 15_000 });
        // No mocked transport or DOM: requestAnimationFrame samples the actual spectator page.
        // A literal script avoids tsx injecting Node-only function-name helpers into page code.
        const measurement = page.evaluate<{
          intervals: number[]; positions: number; minRunners: number; maxRunners: number;
          longTasks: number[]; durationMs: number;
        }>(`new Promise((resolve) => {
          const intervals = [], longTasks = [];
          const positions = new Set();
          const start = performance.now(); let last;
          let minRunners = Infinity, maxRunners = 0;
          let frame = 0, stopped = false;
          const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) longTasks.push(entry.duration); });
          observer.observe({ type: "longtask", buffered: false });
          const tick = (now) => {
            if (stopped) return;
            const runners = document.querySelectorAll('[data-testid="race-track"] [data-runner]');
            if (runners.length > 0) {
              minRunners = Math.min(minRunners, runners.length); maxRunners = Math.max(maxRunners, runners.length);
              positions.add(Math.round(runners[0].getBoundingClientRect().top * 10) / 10);
              if (last !== undefined) intervals.push(now - last);
            }
            last = now;
            frame = requestAnimationFrame(tick);
          };
          const finish = () => {
            if (stopped) return;
            stopped = true; cancelAnimationFrame(frame); clearTimeout(deadline); observer.disconnect();
            document.removeEventListener("incision-load-stop", finish);
            resolve({ intervals, positions: positions.size, minRunners, maxRunners, longTasks, durationMs: performance.now() - start });
          };
          const deadline = setTimeout(finish, 120_000);
          document.addEventListener("incision-load-stop", finish, { once: true });
          frame = requestAnimationFrame(tick);
        })`).catch(() => undefined);
        return {
          async finish(): Promise<BrowserReport> {
            await page.getByRole("table", { name: "Classement de la manche" }).waitFor({ timeout: 15_000 });
            await page.evaluate(() => document.dispatchEvent(new Event("incision-load-stop")));
            const result = await measurement;
            if (!result) throw new Error("Browser sample was lost");
            return {
              passed: result.minRunners === 30 && result.maxRunners === 30 && result.positions > 1 && pageErrors === 0,
              mode: "real spectator page during the same server load", additionalSockets: 1,
              viewport: { width: 1440, height: 1000 }, locale: "fr-CA", theme: "abysse",
              durationMs: result.durationMs, minRunners: result.minRunners, runners: result.maxRunners, distinctPositions: result.positions,
              frameIntervalsMs: summary(result.intervals), longTasksMs: summary(result.longTasks), pageErrors,
              resultsVisible: true,
            };
          },
        };
      },
      close: () => browser.close(),
    };
  } catch (error) { await browser.close(); throw error; }
}
