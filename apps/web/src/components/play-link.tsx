"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { pillControl } from "@/components/ui/styles";

/** JOUER of the design: the public rooms (JOIN-02), marked current on its own page like AccountLink. */
export function PlayLink({ label }: { readonly label: string }) {
  const current = usePathname() === "/rooms";
  return (
    <Link
      href="/rooms"
      aria-current={current ? "page" : undefined}
      className={`${pillControl} font-mono text-xs tracking-[0.14em] uppercase aria-[current=page]:underline aria-[current=page]:decoration-ligne aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-4`}
    >
      {label}
    </Link>
  );
}
