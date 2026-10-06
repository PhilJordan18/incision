import type { Metadata } from "next";
import { NotFoundPanel } from "@/components/errors/not-found-panel";
import { getRequestDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.notFound.title };
}

/** `notFound()` from a page of the (site) group: its layout already draws the shell. */
export default async function SiteNotFound() {
  const { t } = await getRequestDictionary();
  return <NotFoundPanel t={t.notFound} />;
}
