import { expect, test } from "@playwright/test";

for (const locale of ["fr-CA", "en-US"]) {
  test(`reduced-motion theme changes keep secondary text readable (${locale})`, async ({ browser }) => {
    test.slow();
    const context = await browser.newContext({ locale, colorScheme: "dark", reducedMotion: "reduce" });
    try {
      const page = await context.newPage();
      await page.goto("/guest?quickplay=1");
      const hint = page.locator("#guest-nickname-hint");
      await expect(hint).toBeVisible();
      for (const width of [1440, 1024, 390, 360]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const control of ["system", "button"] as const) {
          // A fresh page without a preference cookie follows the system again.
          await context.clearCookies({ name: "theme" });
          await page.emulateMedia({ colorScheme: "dark" });
          await page.reload();
          await expect(page.locator("html")).toHaveAttribute("data-theme", "abysse");
          for (const colorScheme of ["light", "dark"] as const) {
            const theme = colorScheme === "light" ? "aube" : "abysse";
            const samples = hint.evaluate(async (element, expectedTheme) => {
              function luminance(color: string): number {
                const channels = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
                if (channels?.length !== 3) throw new Error(`Unexpected computed colour: ${color}`);
                const linear = channels.map(value => {
                  const s = value / 255;
                  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
                });
                return linear[0]! * 0.2126 + linear[1]! * 0.7152 + linear[2]! * 0.0722;
              }
              const readings: { theme: string | undefined; ratio: number }[] = [];
              const start = performance.now();
              let changedAt: number | undefined;
              while (performance.now() - start < 5_000 && (changedAt === undefined || performance.now() - changedAt < 350)) {
                await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
                let background: Element | null = element;
                while (background !== null && getComputedStyle(background).backgroundColor === "rgba(0, 0, 0, 0)") background = background.parentElement;
                if (background === null) throw new Error("No opaque background for the hint");
                const foreground = luminance(getComputedStyle(element).color);
                const backdrop = luminance(getComputedStyle(background).backgroundColor);
                readings.push({ theme: document.documentElement.dataset.theme, ratio: (Math.max(foreground, backdrop) + 0.05) / (Math.min(foreground, backdrop) + 0.05) });
                if (document.documentElement.dataset.theme === expectedTheme) changedAt ??= performance.now();
              }
              return readings;
            }, theme);
            if (control === "system") await page.emulateMedia({ colorScheme });
            else await page.getByRole("button", { name: /^(Passer au thème|Switch to the)/ }).click();
            await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
            const readings = await samples;
            expect(readings.some(reading => reading.theme === theme)).toBe(true);
            expect(Math.min(...readings.map(reading => reading.ratio)), `${locale}, ${width}, ${control}, ${theme}: ${JSON.stringify(readings)}`).toBeGreaterThanOrEqual(4.5);
          }
        }
      }
    } finally {
      await context.close();
    }
  });
}
