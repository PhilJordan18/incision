import Link from "next/link";
import { card, secondaryButton } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";
import { JoinCodeForm } from "@/components/rooms/join-code-form";
import { SeaRoutes } from "./_home/sea-routes";

const VISIBILITIES = ["public", "code", "private"] as const;

/** Home (screen 01), checkpoint subset: title, join by code, the sea, the three room kinds. */
export default async function Home() {
  const { t } = await getRequestDictionary();
  return (
    <>
      {/* On a desktop screen the whole page, footer included, fits without scrolling: the
          title and the sea follow the screen's height as well as its width. */}
      <div className="grid items-center gap-8 [grid-template-columns:repeat(auto-fit,minmax(min(520px,100%),1fr))]">
        <section className="flex flex-col gap-5">
          <h1 className="font-display text-[clamp(56px,min(11vw,10.5svh),112px)] leading-[0.86] font-black uppercase">
            {/* Spaces keep the words apart for screen readers and reader views. */}
            {t.home.titleLine1}{" "}
            <br />
            {t.home.titleLine2}{" "}
            <br />
            <em className="font-serif font-normal normal-case italic">{t.home.titleSerif}</em>
          </h1>
          <p className="max-w-[560px] text-lg leading-normal text-embrun">{t.home.description}</p>
          <JoinCodeForm
            t={t.home}
            besideAction={
              <Link href="/rooms/new" className={secondaryButton}>
                {t.home.createRoom}
              </Link>
            }
          />
        </section>
        <div className="red-mist flex justify-center [--mist-x:50%] [--mist-y:40%]">
          <SeaRoutes />
        </div>
      </div>
      <section aria-labelledby="visibility-heading">
        <h2 id="visibility-heading" className="sr-only">
          {t.home.visibilityHeading}
        </h2>
        <ul className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {VISIBILITIES.map((visibility, index) => (
            <li key={visibility} className={`${card} flex items-start gap-3.5 p-4`}>
              <span aria-hidden="true" className="font-display text-[28px] leading-none font-black text-moi">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex flex-col gap-1">
                <strong className="font-semibold">{t.home.visibilities[visibility].title}</strong>
                <span className="text-sm text-brume">{t.home.visibilities[visibility].body}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
