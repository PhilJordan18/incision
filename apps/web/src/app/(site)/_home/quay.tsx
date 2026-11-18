import Link from "next/link";
import { discreetButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { homeRouteCopy } from "@/i18n/home-route";
import type { Locale } from "@/i18n/locale";
import { QuayScene } from "./escale-scenes";
import { QuayJoinForm } from "./quay-join-form";
import { HOME_CONTAINER } from "./scene-parts";

/**
 * The departure quay that ends the home: the code field once more, for who read the whole map.
 * Its button is secondary, so the page keeps a single red action (the first frame's).
 */
export function Quay({ locale, t }: { readonly locale: Locale; readonly t: Dictionary }) {
  const route = homeRouteCopy(locale);
  return (
    <section aria-labelledby="quay-heading" className="bg-mer py-11 md:py-14 xl:py-[72px]">
      <div className={`${HOME_CONTAINER} flex flex-col gap-6 md:flex-row md:items-center md:justify-between md:gap-10`}>
        <div className="min-w-0">
          <p className="font-mono text-xs font-medium tracking-[0.2em] text-brume uppercase">{`[.${route.departureLabel}]`}</p>
          <h2 id="quay-heading" className="mt-3 mb-[22px] font-display text-[40px] leading-[0.9] font-black uppercase md:text-[52px] xl:text-[64px] min-[1400px]:text-[74px]">
            {route.quayTitleBold}{" "}
            <em className="font-serif font-normal normal-case italic">{route.quayTitleSerif}</em>
          </h2>
          <QuayJoinForm
            t={t.home}
            codeContext={route.quayCodeContext}
            joinLabel={route.quayJoin}
            besideAction={
              <Link href="/rooms/new" className={`${discreetButton} h-14`}>
                {t.home.createRoom}
              </Link>
            }
          />
        </div>
        <QuayScene />
      </div>
    </section>
  );
}
