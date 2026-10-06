"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Header link to the account or the sign-in page, marked current on its own page. */
export function AccountLink({ href, label }: { readonly href: "/account" | "/sign-in"; readonly label: string }) {
  const current = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className="inline-flex h-11 items-center rounded-full bg-ecume px-5 text-[15px] font-semibold text-abysse aria-[current=page]:underline aria-[current=page]:decoration-ligne aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-4"
    >
      {label}
    </Link>
  );
}
