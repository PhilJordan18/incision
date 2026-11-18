import { DEMO_ACCOUNTS } from "@incision/database/demo-accounts";
import { expect, test } from "@playwright/test";
import { expectNoAccessibilityViolation, expectNoHorizontalScroll, signInWithCredentials } from "./support";

const [, bruno] = DEMO_ACCOUNTS;
if (bruno === undefined) {
  throw new Error("No second demo account");
}

test.use({ locale: "fr-CA" });

test.describe("theme (DES-05)", () => {
  test("follows the system before any choice, from the inline script alone", async ({ browser, baseURL }) => {
    for (const [colorScheme, theme] of [
      ["light", "aube"],
      ["dark", "abysse"],
    ] as const) {
      const context = await browser.newContext({ colorScheme, locale: "fr-CA" });
      // No application script can run: only the inline script in the HTML can set the theme.
      await context.route("**/_next/static/**/*.js", (route) => route.abort());
      const page = await context.newPage();
      await page.goto(baseURL ?? "");
      await expect(page.locator("html")).toHaveAttribute("data-theme-choice", "system");
      await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
      await context.close();
    }
  });

  test("keeps an explicit choice, rendered by the server on the next pages", async ({ page, request }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");
    await page.getByRole("button", { name: "Passer au thème clair Aube" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aube");
    await page.goto("/sign-in");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aube");
    await expect(page.getByRole("button", { name: "Passer au thème sombre Abysse" })).toBeVisible();

    const html = await (await request.get("/", { headers: { cookie: "theme=aube" } })).text();
    expect(html).toMatch(/<html[^>]*data-theme="aube"/);
  });
});

test.describe("language (I18N-02)", () => {
  test("switches from the header, keeps the choice and translates metadata", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "fr");
    // The visible abbreviation must occur in the accessible name (WCAG 2.5.3).
    const english = page.getByRole("button", { name: "EN — English", exact: true });
    await expect(page.getByRole("button", { name: "FR — Français", exact: true })).toBeVisible();
    await english.focus();
    await expect(english).toBeFocused();
    await english.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Overtake.");
    await expect(page.getByRole("button", { name: "English" })).toHaveAttribute("aria-pressed", "true");
    await page.goto("/sign-in");
    await expect(page).toHaveTitle("Sign in · Incision");
    await page.getByRole("button", { name: "Français" }).click();
    await expect(page).toHaveTitle("Connexion · Incision");
  });
});

test.describe("home (screen 01, JOIN-01)", () => {
  test("checks the room code with the domain rule and explains the error", async ({ page }) => {
    await page.goto("/");
    const code = page.getByLabel("Code de salle", { exact: true });
    await code.fill("ABC");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(code).toHaveAttribute("aria-invalid", "true");
    await expect(code).toBeFocused();
    await expect(page.getByText("Un code compte 6 caractères.")).toBeVisible();
    await code.fill("OOOOOO");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    await expect(page.getByText("Le code n’utilise que des lettres et des chiffres, sans 0, O, 1, I ni L.")).toBeVisible();
    await code.fill(" b7k4pq ");
    await page.getByRole("button", { name: "Rejoindre la salle" }).click();
    // A valid code without a session: sign in first, then back to the room (CP-06).
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Frooms%2FB7K4PQ$/);
  });

  test("keeps the words of its title apart", async ({ page }) => {
    await page.goto("/");
    // Line breaks alone would read "Tape.Dépasse.arrive." in screen readers and reader views.
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^Tape\.\s+Dépasse\.\s+arrive\.$/);
  });

  // The home now scrolls (C1 « Cap »), but joining and creating stay in the first frame,
  // without scrolling, at the original viewport, on a 1366 × 700 laptop and on a low screen.
  for (const viewport of [
    { width: 1440, height: 800 },
    { width: 1366, height: 700 },
    { width: 1280, height: 640 },
  ]) {
    test(`keeps the entry actions in the first frame at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeInViewport({ ratio: 1 });
      await expect(page.getByLabel("Code de salle", { exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("button", { name: "Rejoindre la salle", exact: true })).toBeInViewport({ ratio: 1 });
      await expect(page.getByRole("link", { name: "Créer une salle", exact: true }).first()).toBeInViewport({ ratio: 1 });
      await expectNoHorizontalScroll(page);
    });
  }

  test("shows my logo, the favicon and a single red action", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator('header img[src="/brand/ico-red.svg"]')).toBeVisible();
    await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /\/icon\.svg/);
    await expect(page.locator("main .bg-action")).toHaveCount(1);
  });
});

test.describe("home route map and quay (C1 « Cap », DES-04, A11Y-02)", () => {
  test("orders its headings and tells the guide as four escales", async ({ page }) => {
    await page.goto("/");
    const outline = await page.locator("main").locator("h1, h2, h3, h4, h5, h6").evaluateAll((headings) =>
      headings.map((heading) => `${heading.tagName} ${(heading.textContent ?? "").replace(/\s+/g, " ").trim()}`),
    );
    expect(outline).toEqual([
      "H1 Tape. Dépasse. arrive.",
      "H2 Les repères de ta traversée",
      "H3 Rejoindre ou créer",
      "H3 Entraînement ou Arcade",
      "H3 Taper à ton rythme",
      "H3 Lire tes résultats",
      "H2 Prêt à lever l’ancre ?",
    ]);
    const map = page.getByRole("region", { name: "Les repères de ta traversée" });
    await expect(map.getByText("[.Carte de route]")).toBeVisible();
    const escales = map.getByRole("listitem");
    await expect(escales).toHaveCount(4);
    for (const [index, label] of ["[.Escale 01]", "[.Escale 02]", "[.Escale 03]", "[.Escale 04]"].entries()) {
      await expect(escales.nth(index).getByText(label)).toBeVisible();
    }
    await expect(escales.nth(2)).toContainText("Après le décompte, tape le texte au clavier.");
  });

  test("lists the three accesses in escale 01 instead of the three cards", async ({ page }) => {
    await page.goto("/");
    const first = page.getByRole("region", { name: "Les repères de ta traversée" }).getByRole("listitem").first();
    const accesses = first.locator("dl");
    await expect(accesses.locator("dt")).toHaveText(["01 Salle publique", "02 Sur code", "03 Privée"]);
    await expect(accesses.locator("dd")).toHaveText([
      "Visible dans la liste, ouverte à tous.",
      "Cachée de la liste : on entre avec son code de 6 caractères.",
      "Sur invitation seulement : un lien personnel, le code seul ne suffit pas.",
    ]);
    // Said once: the cards that carried these texts left the page with this list's arrival.
    await expect(page.locator("main").getByText("Visible dans la liste, ouverte à tous.")).toHaveCount(1);
    await expect(page.getByRole("heading", { name: "Trois façons d’ouvrir une salle" })).toHaveCount(0);
  });

  test("keeps every scene decorative and shows no figure in escale 04", async ({ page }) => {
    await page.goto("/");
    const scenes = page.locator("main svg");
    expect(await scenes.count()).toBeGreaterThanOrEqual(6);
    expect(await scenes.evaluateAll((all) => all.every((scene) => scene.getAttribute("aria-hidden") === "true" && scene.getAttribute("focusable") === "false"))).toBe(true);
    // Static: no SMIL element, and no CSS animation or transition running on a scene.
    expect(await scenes.evaluateAll((all) => all.filter((scene) => scene.querySelector("animate, animateTransform, animateMotion") !== null).length)).toBe(0);
    expect(await scenes.evaluateAll((all) => all.reduce((count, scene) => count + scene.getAnimations({ subtree: true }).length, 0))).toBe(0);
    // The text sheet of escale 03 is a picture of the race text, not a text to read twice.
    await expect(page.locator("main .course-texte").locator("xpath=..")).toHaveAttribute("aria-hidden", "true");
    // The Arcade drawing names the three bonuses but ties none to a milestone: the draw is random.
    expect(await page.locator('main svg[data-scene="modes"] text').allTextContents()).not.toContainEqual(expect.stringMatching(/\d/));
    // A logbook of shapes: no speed, rank, percentage or name is invented for a visitor without data.
    const logbook = page.locator('main svg[data-scene="logbook"]');
    await expect(logbook).toBeVisible();
    expect(await logbook.locator("text").allTextContents()).not.toContainEqual(expect.stringMatching(/\d/));
    const fourth = page.getByRole("region", { name: "Les repères de ta traversée" }).getByRole("listitem").nth(3);
    // Its label aside, the escale's text carries no digit at all.
    const copy = await fourth.getByRole("heading", { level: 3 }).locator("xpath=..").innerText();
    expect(copy.replace(/\[\.Escale 04\]/i, "")).not.toMatch(/\d/);
  });

  test("repeats the code on the quay with its own secondary action", async ({ page }) => {
    await page.goto("/");
    const quay = page.getByRole("region", { name: "Prêt à lever l’ancre ?" });
    await expect(quay.getByText("[.Départ]")).toBeVisible();
    const code = quay.getByLabel("Code de salle — au quai de départ", { exact: true });
    await expect(code).toHaveAttribute("id", "quay-room-code");
    const join = quay.getByRole("button", { name: "Embarquer avec ce code", exact: true });
    await expect(join).not.toHaveClass(/bg-action/);
    await expect(quay.getByRole("link", { name: "Créer une salle", exact: true })).toHaveAttribute("href", "/rooms/new");
    // The two forms never answer for each other: the refusal and the focus stay on the quay.
    await code.fill("ABC");
    await join.click();
    await expect(code).toHaveAttribute("aria-invalid", "true");
    await expect(code).toHaveAttribute("aria-describedby", "quay-room-code-error");
    await expect(code).toBeFocused();
    await expect(quay.getByText("Un code compte 6 caractères.")).toBeVisible();
    await expect(page.getByLabel("Code de salle", { exact: true })).toHaveAttribute("aria-invalid", "false");
    await expect(page.locator("main .bg-action")).toHaveCount(1);
    await code.fill("b7k4pq");
    await code.press("Enter");
    await expect(page).toHaveURL(/\/sign-in\?callbackUrl=%2Frooms%2FB7K4PQ$/);
  });

  test("runs its bands from one edge of the window to the other, with the red coast in both themes", async ({ page, context, baseURL }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    for (const theme of ["abysse", "aube"] as const) {
      await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
      await page.goto("/");
      // Wider than the page container: the home lifts the shell's width limit for its bands only.
      const quay = await page.getByRole("region", { name: "Prêt à lever l’ancre ?" }).boundingBox();
      expect(quay?.x).toBe(0);
      expect(quay?.width).toBe(await page.evaluate(() => document.documentElement.clientWidth));
      const container = await page.getByRole("heading", { level: 1 }).boundingBox();
      expect(container?.x).toBeGreaterThanOrEqual(48);
      // The coast is a land, not the sea: on Aube it is the 20 % mix, never the pale error surface.
      const colours = await page.locator("main svg").first().evaluate((sea) => {
        const land = sea.querySelector("path[class*='land']");
        const probe = document.createElement("i");
        probe.style.color = "var(--color-erreur-fond)";
        sea.parentElement?.append(probe);
        const paleSurface = getComputedStyle(probe).color;
        probe.remove();
        return { land: land === null ? "" : getComputedStyle(land).fill, paleSurface };
      });
      expect(colours.land).not.toBe("");
      if (theme === "aube") {
        expect(colours.land).not.toBe(colours.paleSurface);
      } else {
        expect(colours.land).toBe(colours.paleSurface);
      }
      await expectNoHorizontalScroll(page);
    }
  });

  test("translates the route map and the quay", async ({ page, context, baseURL }) => {
    await context.addCookies([{ name: "locale", value: "en", url: baseURL ?? "" }]);
    await page.goto("/");
    const map = page.getByRole("region", { name: "Chart your course" });
    await expect(map.getByText("[.Route chart]")).toBeVisible();
    await expect(map.getByText("[.Port of call 04]")).toBeVisible();
    const quay = page.getByRole("region", { name: "Ready to cast off?" });
    await expect(quay.getByText("[.Departure]")).toBeVisible();
    await expect(quay.getByLabel("Room code — at the departure quay", { exact: true })).toBeVisible();
    await expect(quay.getByRole("button", { name: "Board with this code", exact: true })).toBeVisible();
    await expect(page.locator("main .bg-action")).toHaveCount(1);
  });

  test("stacks each escale as number, text, drawing at 390 px", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    const escales = page.getByRole("region", { name: "Les repères de ta traversée" }).getByRole("listitem");
    for (let index = 0; index < 4; index += 1) {
      const escale = escales.nth(index);
      const number = await escale.locator('div[aria-hidden="true"]').filter({ hasText: `0${index + 1}` }).first().boundingBox();
      const title = await escale.getByRole("heading", { level: 3 }).boundingBox();
      const drawing = await escale.locator("svg[data-scene]").boundingBox();
      if (number === null || title === null || drawing === null) {
        throw new Error(`Escale ${index + 1} is incomplete`);
      }
      expect(number.y + number.height).toBeLessThanOrEqual(title.y);
      expect(title.y + title.height).toBeLessThan(drawing.y);
      // One column: nothing sits beside the text.
      expect(drawing.x).toBeLessThan(40);
    }
    await expectNoHorizontalScroll(page);
  });
});

test.describe("unknown URL (apps/web/AGENTS.md)", () => {
  // The rule against notFound() in pages relies on this: app/not-found.tsx is rendered by
  // the server, with the theme, unlike Next's bare error document (`__next_error__`).
  test("answers 404 with the not-found page rendered by the server, readable without JavaScript", async ({ browser, request, baseURL }) => {
    const response = await request.get("/this-page-does-not-exist", { headers: { cookie: "theme=aube" } });
    expect(response.status()).toBe(404);
    const html = await response.text();
    expect(html).not.toContain("__next_error__");
    expect(html).toMatch(/<html[^>]*\sdata-theme-choice="aube"/);

    const context = await browser.newContext({ javaScriptEnabled: false, locale: "fr-CA" });
    await context.addCookies([{ name: "theme", value: "aube", url: baseURL ?? "" }]);
    const page = await context.newPage();
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("html")).toHaveAttribute("data-theme", "aube");
    await expect(page.getByText("Erreur 404")).toBeVisible();
    await expect(page.getByText("Cette page n’existe pas ou n’est plus disponible.")).toBeVisible();
    await expect(page).toHaveTitle("Page introuvable · Incision");
    await context.close();
  });
});

test.describe("layout and accessibility (DES-06, A11Y)", () => {
  for (const theme of ["abysse", "aube"] as const) {
    test(`has no WCAG A/AA violation on the public pages in ${theme}`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
      for (const path of ["/", "/sign-in", "/auth/error", "/this-page-does-not-exist"]) {
        await page.goto(path);
        await expectNoAccessibilityViolation(page);
      }
    });
  }

  for (const theme of ["abysse", "aube"] as const) {
    test(`has no WCAG A/AA violation on the account page in ${theme}`, async ({ page, context, baseURL }) => {
      await context.addCookies([{ name: "theme", value: theme, url: baseURL ?? "" }]);
      await signInWithCredentials(page, bruno.login, bruno.password);
      await expect(page).toHaveURL(/\/account$/);
      await expectNoAccessibilityViolation(page);
    });
  }

  test("fits 360 px without horizontal scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const path of ["/", "/sign-in", "/auth/error", "/this-page-does-not-exist"]) {
      await page.goto(path);
      await expectNoHorizontalScroll(page);
    }
    await signInWithCredentials(page, bruno.login, bruno.password);
    await expect(page).toHaveURL(/\/account$/);
    await expectNoHorizontalScroll(page);
  });
});
