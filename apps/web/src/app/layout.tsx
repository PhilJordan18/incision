import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { getRequestDictionary } from "@/i18n/server";
import { getAccountSession } from "@/server/auth/session";
import { SITE_NAME } from "./site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: { default: SITE_NAME, template: `%s · ${SITE_NAME}` }, description: t.metadata.description };
}

const LINK_CLASS = "rounded-sm underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

// Minimal shell for CP-04; the art direction, theme and language switchers come with CP-05.
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [{ locale, t }, session] = await Promise.all([getRequestDictionary(), getAccountSession()]);
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:rounded-md focus:bg-foreground focus:px-4 focus:py-2 focus:text-background"
        >
          {t.layout.skipToContent}
        </a>
        <header className="border-b border-foreground/15">
          <nav aria-label={t.layout.mainNavigation} className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className={`font-semibold ${LINK_CLASS}`}>
              {SITE_NAME}
            </Link>
            {session === null ? (
              <Link href="/sign-in" className={LINK_CLASS}>
                {t.layout.signIn}
              </Link>
            ) : (
              <Link href="/account" className={LINK_CLASS}>
                {t.layout.account}
              </Link>
            )}
          </nav>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
          {children}
        </main>
      </body>
    </html>
  );
}
