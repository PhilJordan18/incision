import type { ReactNode } from "react";
import type { Dictionary } from "@/i18n/dictionaries";
import { homeRouteCopy } from "@/i18n/home-route";
import { journeyCopy } from "@/i18n/journey";
import type { Locale } from "@/i18n/locale";
import { publicRoomsCopy } from "@/i18n/public-rooms";
import { raceCharts } from "@/i18n/race-charts";
import { resultsDetails } from "@/i18n/results-details";
import { AccessScene, LogbookScene, ModesScene, TypingScene } from "./escale-scenes";
import styles from "./home.module.css";
import { HOME_CONTAINER, SeaDecor } from "./scene-parts";

const VISIBILITIES = ["public", "code", "private"] as const;
const etiquette = "font-mono text-xs font-medium tracking-[0.2em] text-brume uppercase";
const twoDigits = (value: number): string => String(value).padStart(2, "0");

/** The last word of a title goes in Instrument Serif (design rule 6); the text itself is unchanged. */
function splitLastWord(title: string): { readonly bold: string; readonly serif: string } {
  const cut = title.lastIndexOf(" ");
  return cut < 0 ? { bold: title, serif: "" } : { bold: title.slice(0, cut), serif: title.slice(cut + 1) };
}

type RouteMapProps = { readonly locale: Locale; readonly t: Dictionary };

/**
 * The route map (C1 « Cap »): the existing guide (`i18n/journey.ts`) told as four escales, each with
 * a decorative drawing. Escale 01 lists the three ways into a room, which replaces the home's
 * three visibility cards.
 */
export function RouteMap({ locale, t }: RouteMapProps) {
  const guide = journeyCopy(locale);
  const route = homeRouteCopy(locale);
  const title = splitLastWord(guide.guide);
  const modes = publicRoomsCopy(locale);
  const { kinds } = t.races.bonuses;

  const scenes: readonly ReactNode[] = [
    <AccessScene
      key="access"
      words={{
        publicRoom: t.home.visibilities.public.title,
        byCode: t.home.visibilities.code.title,
        privateRoom: t.home.visibilities.private.title,
        code: t.home.codePlaceholder,
        north: route.scenes.north,
      }}
    />,
    <ModesScene
      key="modes"
      words={{
        training: modes.training,
        noBonuses: resultsDetails[locale].noBonuses,
        arcade: modes.arcade,
        bonusesAtMilestones: route.scenes.bonusesAtMilestones,
        bonuses: [kinds.fogLeader, kinds.extendLeader, kinds.shortenSelf],
      }}
    />,
    <div key="typing">
      {/* A still picture of the race's text sheet: nothing here is typed or moves. */}
      <div aria-hidden="true" className="rounded-carte border border-moi bg-nuit px-3.5 pt-3 pb-1.5 md:px-5 md:pt-3.5 md:pb-2">
        <p className="font-mono text-[11px] font-medium tracking-[0.2em] text-brume uppercase">{t.races.textLabel}</p>
        <p className="course-texte text-sm! md:text-[15px]! lg:text-lg!">
          <span className="course-juste">{route.scenes.sample.typed}</span>
          <span className="course-erreur">{route.scenes.sample.wrong}</span>
          <span className="course-juste">{route.scenes.sample.typedAfter}</span>
          <span className="course-curseur">{route.scenes.sample.next}</span>
          {route.scenes.sample.rest}
        </p>
      </div>
      <div className="mt-3.5">
        <TypingScene words={{ rows: route.scenes.keyboardRows, recentKeys: route.scenes.recentKeys, nextKey: route.scenes.nextKey }} />
      </div>
    </div>,
    <LogbookScene
      key="logbook"
      words={{
        logbook: route.scenes.logbook,
        netWpm: raceCharts[locale].net,
        accuracy: t.races.tiles.accuracy,
        record: route.scenes.record,
        curve: `${route.scenes.curve} · ${t.races.wpm}`,
        keys: route.scenes.logKeys,
        missedKeys: route.scenes.missedKeys,
      }}
    />,
  ];

  return (
    <section aria-labelledby="journey-heading">
      <div className="relative pt-11 pb-16 text-center md:pt-14 md:pb-[84px] lg:pt-[72px] lg:pb-24">
        <div className={HOME_CONTAINER}>
          <p className={etiquette}>{`[.${route.mapLabel}]`}</p>
          <h2 id="journey-heading" className="mt-3.5 mb-3 font-display text-[44px] leading-[0.9] font-black uppercase md:text-[64px] lg:text-[88px]">
            {title.bold}
            {title.serif !== "" && (
              <>
                {" "}
                <em className="font-serif font-normal normal-case italic">{title.serif}</em>
              </>
            )}
          </h2>
          <p className="text-base text-embrun md:text-lg">{guide.intro}</p>
        </div>
        <div aria-hidden="true" className={`${styles.spine} top-auto! hidden h-16 md:block`} />
      </div>
      <ol>
        {guide.steps.map((step, index) => {
          const number = twoDigits(index + 1);
          const onSea = index % 2 === 0;
          const headingId = `escale-${number}`;
          return (
            <li key={step.title} className={`relative ${onSea ? "bg-mer" : ""}`}>
              {index === 2 ? <RedBand /> : <div aria-hidden="true" className={`${styles.belt} bg-abysse`} />}
              <div className="relative overflow-hidden py-9 md:py-10">
                <SeaDecor id={`home-waves-${number}`} ghost={number} ghostSide={onSea ? "right" : "left"} />
                <div className={`${HOME_CONTAINER} relative flex flex-col gap-[18px] md:grid md:min-h-[440px] md:grid-cols-[1fr_84px_1fr] md:items-center md:gap-4 lg:min-h-[520px] lg:grid-cols-[1fr_120px_1fr] lg:gap-6`}>
                  <div aria-hidden="true" className="relative z-10 grid h-[60px] w-[60px] place-items-center rounded-full border-[3px] border-moi bg-abysse pt-1 font-display text-[26px] leading-none font-black md:order-2 md:h-16 md:w-16 md:justify-self-center md:text-[28px] lg:h-[84px] lg:w-[84px] lg:text-[38px]">
                    {number}
                  </div>
                  <div className={onSea ? "md:order-3" : "md:order-1"}>
                    <p className={etiquette}>{`[.${route.stops[index] ?? ""}]`}</p>
                    <h3 id={headingId} className="mt-2 mb-2.5 font-display text-[40px] leading-[0.9] font-black uppercase md:mt-3 md:mb-3.5 md:text-[46px] lg:text-[64px]">
                      {step.title}
                    </h3>
                    <p className="max-w-[520px] text-base text-embrun lg:text-lg">{step.body}</p>
                    {index === 0 && <AccessList t={t} />}
                  </div>
                  <div className={onSea ? "md:order-1" : "md:order-3"}>{scenes[index]}</div>
                </div>
              </div>
              <div aria-hidden="true" className={`${styles.spine} hidden md:block`} />
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/**
 * The three ways into a room, numbered in the text itself (the numbers are read, not hidden).
 * A description list rather than an ordered one: each access is a name and what it means, and
 * the four escales stay the only list items of the guide.
 */
function AccessList({ t }: { readonly t: Dictionary }) {
  return (
    <dl className="mt-5 grid max-w-[520px] gap-2.5">
      {VISIBILITIES.map((visibility, index) => (
        <div key={visibility} className="grid grid-cols-[44px_1fr] gap-x-2.5 gap-y-1 border-t border-houle pt-2.5">
          <dt className="col-span-2 grid grid-cols-subgrid items-baseline font-semibold">
            <span className="font-display text-[26px] leading-[0.9] font-black text-moi">{twoDigits(index + 1)} </span>
            <span>{t.home.visibilities[visibility].title}</span>
          </dt>
          <dd className="col-start-2 text-sm text-brume">{t.home.visibilities[visibility].body}</dd>
        </div>
      ))}
    </dl>
  );
}

const BAND_TOP = "25 28 89 31 131 34 202 10 251 13 329 16 386 19 421 22 484 25 526 28 598 31 647 34 725 10 782 13 816 16 880 19 922 22 993 25 1043 28 1121 31 1178 34 1212 10 1276 13 1318 16 1389 19 1439 22 1450 22";
const BAND_BOTTOM = "1396 107 1312 104 1259 101 1184 98 1139 95 1070 92 1033 116 973 113 889 110 836 107 760 104 715 101 647 98 610 95 550 92 466 116 413 113 337 110 292 107 224 104 187 101 126 98 43 95 -10 92";

/** The red land the route crosses between escales 02 and 03, with a channel left for the route. */
function RedBand() {
  return (
    <svg viewBox="0 0 1440 126" preserveAspectRatio="none" fill="none" aria-hidden="true" focusable="false" className={`${styles.scene} pointer-events-none block h-[84px] w-full bg-mer md:h-[126px]`}>
      <path className={styles.land} d={`M-10 25 ${BAND_TOP}V104L${BAND_BOTTOM}Z`} />
      <path className={styles.coastline} d={`M-10 25 ${BAND_TOP}`} />
      <path className={styles.coastline} d={`M1450 104 ${BAND_BOTTOM}`} />
      <path d="M700 0 712 126H728L740 0Z" className="fill-mer" />
    </svg>
  );
}
