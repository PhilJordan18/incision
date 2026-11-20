import { type BrowserContext, expect, type Locator, type Page, test } from "@playwright/test";
import { expectNoAccessibilityViolation, forgeSessionCookie, query, SESSION_COOKIE } from "./support";

/**
 * A submit button keeps its label readable while its form's action runs: the pending word is the
 * only thing that says the state, so it keeps ≥ 4.5:1 against the button in both themes, on every
 * button style that uses the shared `SubmitButton`. The request is held in flight, never answered
 * by a fixture: what is measured is the real pending state.
 */
const contexts: BrowserContext[] = [];
test.afterEach(async () => { await Promise.all(contexts.splice(0).map((context) => context.close())); });

const THEMES = ["abysse", "aube"] as const;

/** WCAG contrast of the button's label against what the button paints, with its opacity and every background behind it. */
async function labelContrast(button: Locator): Promise<{ readonly ratio: number; readonly opacity: number }> {
  return button.evaluate(async (node) => {
    // A theme or state change may still be fading: measure what stays on screen.
    await Promise.all(node.getAnimations().map((animation) => animation.finished.catch(() => undefined)));
    const pixel = () => { const canvas = document.createElement("canvas"); canvas.width = canvas.height = 1; return canvas; };
    const style = getComputedStyle(node);
    const opacity = Number(style.opacity);
    const behind: string[] = [];
    for (let current = node.parentElement; current !== null; current = current.parentElement) behind.unshift(getComputedStyle(current).backgroundColor);
    // As the browser paints it: the button (its background, then its label) is drawn on its own,
    // and that whole group is laid at the button's opacity over what is behind it.
    const paint = (withLabel: boolean) => {
      const group = pixel(); const inner = group.getContext("2d")!;
      inner.fillStyle = style.backgroundColor; inner.fillRect(0, 0, 1, 1);
      if (withLabel) { inner.fillStyle = style.color; inner.fillRect(0, 0, 1, 1); }
      const page = pixel(); const outer = page.getContext("2d", { willReadFrequently: true })!;
      for (const layer of behind) { outer.fillStyle = layer; outer.fillRect(0, 0, 1, 1); }
      outer.globalAlpha = opacity; outer.drawImage(group, 0, 0);
      return [...outer.getImageData(0, 0, 1, 1).data].slice(0, 3);
    };
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((value) => { const s = value / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const [surface, text] = [luminance(paint(false)), luminance(paint(true))];
    return { ratio: (Math.max(surface, text) + 0.05) / (Math.min(surface, text) + 0.05), opacity };
  });
}

/** Clicks `button`, holds its form's POST in flight, and checks the pending label; then lets the request go. */
async function expectReadableWhilePending(page: Page, { path, button, pending, label }: {
  readonly path: string; readonly button: Locator; readonly pending: string; readonly label: string;
}): Promise<void> {
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${path}`, async (route) => {
    if (route.request().method() !== "POST") { await route.continue(); return; }
    await held;
    // Never answered: nothing leaves the test, not even a provider redirect.
    await route.abort("aborted").catch(() => undefined);
  });
  try {
    const idle = await labelContrast(button);
    await expect(button.locator("[data-pending-icon]"), `${label}: no hourglass at rest`).toHaveCount(0);
    await button.click();
    const waiting = page.getByRole("button", { name: pending, exact: true });
    await expect(waiting).toHaveAttribute("aria-disabled", "true");
    // Measured at rest, not under the pointer: hover styles are not the pending state.
    await page.mouse.move(0, 0);
    const busy = await labelContrast(waiting);
    expect(busy.ratio, `${label}: pending label ${busy.ratio.toFixed(2)}:1 at opacity ${busy.opacity} (idle ${idle.ratio.toFixed(2)}:1)`).toBeGreaterThanOrEqual(4.5);
    expect(busy.opacity, `${label}: the pending button is not dimmed`).toBe(1);
    // The state is said without colour: the word, and the wait cursor.
    expect(await waiting.evaluate((node) => getComputedStyle(node).cursor)).toBe("wait");
    // And a cue the pointer is not needed for: one fixed hourglass in the label's colour, hidden
    // from assistive technology (the name stays the pending word, checked above), never moving.
    const hourglass = waiting.locator("[data-pending-icon]");
    await expect(hourglass, `${label}: one hourglass while pending`).toHaveCount(1);
    await expect(hourglass).toBeVisible();
    await expect(hourglass).toHaveAttribute("aria-hidden", "true");
    const drawn = await hourglass.evaluate((icon) => ({
      stroke: getComputedStyle(icon).stroke, label: getComputedStyle(icon.closest("button")!).color, moving: icon.getAnimations({ subtree: true }).length,
    }));
    expect(drawn.stroke, `${label}: the hourglass takes the label's colour`).toBe(drawn.label);
    expect(drawn.moving, `${label}: the hourglass never moves`).toBe(0);
    await expectNoAccessibilityViolation(page);
  } finally {
    release();
    await page.unroute(`**${path}`);
  }
}

for (const theme of THEMES) {
  test(`pending submit labels stay readable on the account (primary, secondary), ${theme}`, async ({ browser }) => {
    const [account] = await query<{ id: string; session_version: number }>("insert into accounts(display_name) values ('Pending sailor') returning id, session_version");
    const context = await browser.newContext({ locale: "fr-CA", reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    const baseURL = test.info().project.use.baseURL!;
    await context.addCookies([
      { name: SESSION_COOKIE, url: baseURL, value: await forgeSessionCookie({ sub: account!.id, sessionVersion: account!.session_version, authTime: Math.floor(Date.now() / 1000) }) },
      { name: "theme", url: baseURL, value: theme },
    ]);
    const named = await context.newPage();
    await named.goto("/account");
    await expect(named.locator("html")).toHaveAttribute("data-theme", theme);
    await named.locator("#display-name").fill("Pending sailor two");
    await expectReadableWhilePending(named, { path: "/account", label: `${theme} primary`,
      button: named.getByRole("button", { name: "Enregistrer le nom", exact: true }), pending: "Enregistrement…" });
    const leaving = await context.newPage();
    await leaving.goto("/account");
    await expectReadableWhilePending(leaving, { path: "/account", label: `${theme} secondary`,
      button: leaving.getByRole("button", { name: "Se déconnecter", exact: true }), pending: "Déconnexion…" });
  });

  test(`pending submit labels stay readable on sign-in (primary, provider), ${theme}`, async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-CA", reducedMotion: "reduce", viewport: { width: 1440, height: 900 } });
    contexts.push(context);
    await context.addCookies([{ name: "theme", url: test.info().project.use.baseURL!, value: theme }]);
    const credentials = await context.newPage();
    await credentials.goto("/sign-in");
    await expect(credentials.locator("html")).toHaveAttribute("data-theme", theme);
    await credentials.getByLabel("Nom d’utilisateur", { exact: true }).fill("nobody");
    await credentials.getByLabel("Mot de passe", { exact: true }).fill("not-a-password");
    await expectReadableWhilePending(credentials, { path: "/sign-in", label: `${theme} primary`,
      button: credentials.getByRole("button", { name: "Se connecter", exact: true }), pending: "Connexion…" });
    const provider = await context.newPage();
    await provider.goto("/sign-in");
    await expectReadableWhilePending(provider, { path: "/sign-in", label: `${theme} provider`,
      button: provider.getByRole("button", { name: "Se connecter avec GitHub", exact: true }), pending: "Redirection…" });
  });
}
