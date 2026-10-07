import type { Metadata } from "next";
import { Big_Shoulders, Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import { getRequestDictionary } from "@/i18n/server";
import { getThemeChoice } from "@/theme/server";
import { SYSTEM_THEME_SCRIPT } from "@/theme/theme";
import { SITE_NAME } from "./site";
import "./globals.css";

// The design's four voices, exposed under the variables of apps/design/tokens.css.
// Google Fonts now ships "Big Shoulders Display" as the "Big Shoulders" family.
const display = Big_Shoulders({
  subsets: ["latin", "latin-ext"],
  weight: ["800", "900"],
  variable: "--font-display",
  fallback: ["Arial Narrow", "sans-serif"],
  adjustFontFallback: false,
});
const serif = Instrument_Serif({ subsets: ["latin", "latin-ext"], weight: "400", style: ["normal", "italic"], variable: "--font-serif" });
const sans = Geist({ subsets: ["latin", "latin-ext"], variable: "--font-sans" });
const mono = Geist_Mono({ subsets: ["latin", "latin-ext"], variable: "--font-mono" });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` }, description: t.metadata.description };
}

/**
 * The server renders an explicit theme choice directly; for "system" (the default), the
 * inline script sets `data-theme` before the first paint, so no theme flashes (DES-05).
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ locale }, themeChoice] = await Promise.all([getRequestDictionary(), getThemeChoice()]);
  return (
    <html
      lang={locale}
      data-theme={themeChoice === "system" ? undefined : themeChoice}
      data-theme-choice={themeChoice}
      className={`${display.variable} ${serif.variable} ${sans.variable} ${mono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: SYSTEM_THEME_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-abysse text-ecume">{children}</body>
    </html>
  );
}
