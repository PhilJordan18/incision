import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll } from "./support";

for (const locale of ["fr-CA", "en-US"] as const) {
  for (const theme of ["abysse", "aube"] as const) {
    for (const javaScriptEnabled of [true, false]) {
      test(`wordmark follows system canvas: ${locale}, ${theme}, JS ${javaScriptEnabled}`, async ({ browser, baseURL }) => {
        const context = await browser.newContext({ locale, javaScriptEnabled, viewport: { width: 1440, height: 900 } });
        try {
          await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
          const page = await context.newPage();
          for (const route of ["/", "/sign-in"]) {
            await page.goto(`${baseURL}${route}`);
            const white = page.locator('a img[src="/brand/wm-white.svg"]');
            const black = page.locator('a img[src="/brand/wm-black.svg"]');
            const logo = page.locator('a:has(img[src="/brand/wm-white.svg"])');
            await expect(logo).toHaveCount(1);
            await expect(logo).toHaveAccessibleName(/Incision/);
            for (const colorScheme of ["light", "dark"] as const) {
              await page.emulateMedia({ forcedColors: "active", colorScheme });
              await expect(colorScheme === "light" ? black : white).toBeVisible();
              await expect(colorScheme === "light" ? white : black).toBeHidden();
              await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
              await logo.focus();
              await expect(logo).toBeFocused();
              await page.keyboard.press("Tab");
              await page.keyboard.press("Shift+Tab");
              await expect(logo).toBeFocused();
              for (const width of [1440, 1024, 390, 360]) {
                await page.setViewportSize({ width, height: 900 });
                await expectNoHorizontalScroll(page);
                const visible = colorScheme === "light" ? black : white;
                await expect(visible).toBeVisible();
                const bounds = await logo.boundingBox();
                expect(bounds?.height).toBeGreaterThanOrEqual(44);
                // Captures cover both shared component sizes; never change the provided SVGs.
                if (javaScriptEnabled && locale === "fr-CA" && width !== 360) {
                  await page.screenshot({ path: test.info().outputPath(`${route === "/" ? "home" : "sign-in"}-${colorScheme}-${width}.png`) });
                }
              }
            }
            // Returning to authored colours must restore the saved theme, even if the
            // operating system preference disagrees. Axe does not support forced colours.
            await page.emulateMedia({ forcedColors: "none", colorScheme: theme === "aube" ? "dark" : "light" });
            await expect(theme === "aube" ? black : white).toBeVisible();
            await expect(theme === "aube" ? white : black).toBeHidden();
            if (javaScriptEnabled) await expectNoAccessibilityViolation(page);
          }
        } finally {
          await context.close();
        }
      });
    }
  }
}
