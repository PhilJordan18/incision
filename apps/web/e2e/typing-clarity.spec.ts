import { type Browser, type BrowserContext, expect, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

const contexts: BrowserContext[] = [];
test.beforeEach(async () => {
  await query("update lobbies set host_member_id = null");
  await query("delete from lobbies");
});
test.afterEach(async () => {
  await Promise.all(contexts.splice(0).map(context => context.close()));
});

async function signedIn(browser: Browser, options: { name: string; locale: "fr-CA" | "en-US"; theme: "abysse" | "aube" }): Promise<Page> {
  const [account] = await query<{ id: string; session_version: number }>(
    "insert into accounts (display_name) values ($1) returning id, session_version", [options.name]);
  if (!account) throw new Error("Missing test account");
  const context = await browser.newContext({ locale: options.locale, viewport: { width: 1440, height: 1000 }, reducedMotion: "reduce" });
  contexts.push(context);
  const url = test.info().project.use.baseURL ?? "";
  const cookie = await forgeSessionCookie({ sub: account.id, sessionVersion: account.session_version, authTime: Math.floor(Date.now() / 1000) });
  await context.addCookies([{ name: SESSION_COOKIE, value: cookie, url }, { name: "theme", value: options.theme, url }]);
  return context.newPage();
}

for (const locale of ["fr-CA", "en-US"] as const) {
  for (const theme of ["abysse", "aube"] as const) {
    test(`typing guidance and refused edits in an ordinary race: ${locale} ${theme}`, async ({ browser }) => {
      test.setTimeout(90_000);
      const french = locale === "fr-CA";
      const host = await signedIn(browser, { name: "Captain", locale: "en-US", theme });
      const runner = await signedIn(browser, { name: "Runner", locale, theme });
      const errors: string[] = [];
      runner.on("pageerror", error => errors.push(error.message));
      await host.goto("/rooms/new");
      await expect(host.getByRole("checkbox")).toBeChecked();
      await host.getByRole("button", { name: "Open the room" }).click();
      await expect(host).toHaveURL(/\/rooms\/[2-9A-HJKMNP-Z]{6}$/);
      await runner.goto(host.url());
      await expect(runner.getByRole("checkbox")).toBeChecked();
      await runner.getByRole("button", { name: /^(Join the room|Rejoindre la salle)$/ }).click();
      await expect(runner.getByText(/^\[\.(Live|En direct)\]$/)).toBeVisible();
      const guide = runner.getByRole("region", { name: french ? "Repères de frappe" : "Typing guide" });
      await expect(guide).toHaveCount(0);
      await expect(runner.locator(".course-texte")).toHaveCount(0);
      await host.getByRole("button", { name: "Start the race" }).click();
      const field = runner.getByLabel(french ? "Ta frappe" : "Your typing", { exact: true });
      await expect(field).toBeEnabled({ timeout: 6000 });
      await expect(field).toBeFocused();
      await expect(guide).toContainText(french ? "Correction obligatoire" : "Mandatory correction");
      await expect(guide).toContainText(french ? "corrige le caractère" : "correct the character");
      await expect(field).toHaveAttribute("autocorrect", "off");
      await expect(field).toHaveAttribute("spellcheck", "false");
      const progress = host.getByRole("progressbar", { name: "Runner" });
      await expect(progress).toHaveAttribute("value", "0");

      // Synthetic browser event coverage, not an OS/device autocorrection certification.
      // Check cancellation as well as the absence of accidental accepted keystrokes.
      const cancelled = await field.evaluate(element => {
        const data = new DataTransfer(); data.setData("text/plain", "unwanted text");
        const events = [
          new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }),
          new DragEvent("drop", { dataTransfer: data, bubbles: true, cancelable: true }),
          ...["insertFromPaste", "insertFromDrop", "insertReplacementText"].map(inputType =>
            new InputEvent("beforeinput", { inputType, data: "unwanted text", bubbles: true, cancelable: true })),
        ];
        return events.map(event => !element.dispatchEvent(event));
      });
      expect(cancelled).toEqual([true, true, true, true, true]);
      await expect(field).toHaveValue("");
      await expect(runner.locator(".course-texte .course-juste")).toHaveCount(0);
      const text = (await runner.locator(".course-texte").textContent()) ?? "";
      expect(text.length).toBeGreaterThan(5);
      for (const [index, width] of [768, 1024].entries()) {
        await runner.setViewportSize({ width, height: 1000 });
        await field.scrollIntoViewIfNeeded();
        // Reduced motion still permits the design's 150 ms responsive transitions.
        // Finish those before comparing geometry across a keystroke, not across a resize.
        await field.evaluate(async () => {
          await document.fonts.ready;
          await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
          await Promise.all(document.getAnimations().filter(animation =>
            animation.effect?.getComputedTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => undefined)));
        });
        const before = await field.boundingBox();
        await field.pressSequentially(text[index]!, { delay: 80 });
        // A separate browser receives server-authoritative progress: rejected edits never preceded this key.
        await expect(progress).toHaveAttribute("value", String(index + 1));
        expect(await field.boundingBox()).toEqual(before);
        await expect(guide).toBeVisible();
        await expectNoAccessibilityViolation(runner);
        await expectNoHorizontalScroll(runner);
      }
      // Preserve composition and Backspace without changing existing input handlers.
      await field.evaluate((element, character) => {
        element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
        element.dispatchEvent(new InputEvent("beforeinput", { inputType: "insertCompositionText", data: character, bubbles: true }));
        element.dispatchEvent(new CompositionEvent("compositionend", { data: character, bubbles: true }));
      }, text[2]!);
      await expect(progress).toHaveAttribute("value", "3");
      await field.press("Backspace");
      await expect(runner.locator(".course-texte .course-juste")).toHaveCount(2);
      await field.pressSequentially(text[2]!, { delay: 80 });
      await expect(runner.locator(".course-texte .course-juste")).toHaveCount(3);
      await field.press("Enter");
      await expect(runner.locator(".course-texte .course-juste")).toHaveCount(3);
      for (const width of [1440, 1024, 390, 360]) {
        await runner.setViewportSize({ width, height: 1000 });
        if (width < 768) {
          await expect(field).toHaveCount(0);
          await expect(guide).toHaveCount(0);
          await expect(runner.getByRole("heading", { name: french ? "Un clavier physique pour courir" : "A physical keyboard to race" })).toBeVisible();
        } else {
          await expect(guide).toBeVisible();
        }
        await expectNoAccessibilityViolation(runner);
        await expectNoHorizontalScroll(runner);
        if (width !== 360) await runner.screenshot({ path: test.info().outputPath(`typing-${locale}-${theme}-${width}.png`), fullPage: true });
      }
      expect(errors).toEqual([]);
    });
  }
}
