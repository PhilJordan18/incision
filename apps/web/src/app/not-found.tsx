import type { Metadata } from "next";
import Link from "next/link";
import { getRequestDictionary } from "@/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.notFound.title };
}

export default async function NotFound() {
  const { t } = await getRequestDictionary();
  return (
    <>
      <h1 className="text-3xl font-bold">{t.notFound.title}</h1>
      <p>{t.notFound.body}</p>
      <p>
        <Link href="/" className="underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
          {t.notFound.backHome}
        </Link>
      </p>
    </>
  );
}
