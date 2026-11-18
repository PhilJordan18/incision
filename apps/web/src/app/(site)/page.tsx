import Link from "next/link";
import { JoinCodeForm } from "@/components/rooms/join-code-form";
import { secondaryButton } from "@/components/ui/styles";
import { raceTrackMessages } from "@/i18n/dictionaries/race-track";
import { homeRouteCopy } from "@/i18n/home-route";
import { getRequestDictionary } from "@/i18n/server";
import { FirstFrame } from "./_home/first-frame";
import styles from "./_home/home.module.css";
import { Quay } from "./_home/quay";
import { RouteMap } from "./_home/route-map";

/**
 * Home, art direction C1 « Cap »: the first frame (title, join by code, create a room) over the
 * fleet and the red coast, then the route map in four escales and the departure quay.
 */
export default async function Home() {
  const { t, locale } = await getRequestDictionary();
  return (
    <div className={styles.route}>
      <FirstFrame finish={raceTrackMessages[locale].finish} heading={homeRouteCopy(locale).scenes.heading}>
        <section className="flex flex-col gap-5">
          <h1 className="font-display text-[clamp(64px,min(8.6vw,14svh),112px)] leading-[0.86] font-black uppercase">
            {/* Spaces keep the words apart for screen readers and reader views. */}
            {t.home.titleLine1}{" "}
            <br />
            {t.home.titleLine2}{" "}
            <br />
            <em className="font-serif font-normal normal-case italic">{t.home.titleSerif}</em>
          </h1>
          <p className="max-w-[560px] text-base leading-normal text-embrun md:max-w-[440px] md:text-[17px] lg:max-w-[560px] lg:text-lg">{t.home.description}</p>
          <JoinCodeForm
            t={t.home}
            besideAction={
              <Link href="/rooms/new" className={`${secondaryButton} h-14`}>
                {t.home.createRoom}
              </Link>
            }
          />
        </section>
      </FirstFrame>
      <RouteMap locale={locale} t={t} />
      <Quay locale={locale} t={t} />
    </div>
  );
}
