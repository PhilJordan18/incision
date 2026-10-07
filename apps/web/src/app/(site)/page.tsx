import { card } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";
import { JoinForm } from "./_home/join-form";
import { SeaRoutes } from "./_home/sea-routes";

const VISIBILITIES = ["public", "code", "private"] as const;

/** Home (screen 01), checkpoint subset: title, join by code, the sea, the three room kinds. */
export default async function Home() {
  const { t } = await getRequestDictionary();
  return (
    <>
      <div className="grid items-center gap-10 [grid-template-columns:repeat(auto-fit,minmax(min(520px,100%),1fr))]">
        <section className="flex flex-col gap-7">
          <h1 className="font-display text-[clamp(64px,11vw,120px)] leading-[0.86] font-black uppercase">
            {t.home.titleLine1}
            <br />
            {t.home.titleLine2}
            <br />
            <em className="font-serif font-normal normal-case italic">{t.home.titleSerif}</em>
          </h1>
          <p className="max-w-[480px] text-[19px] leading-normal text-embrun">{t.home.description}</p>
          <JoinForm t={t.home} />
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
            <li key={visibility} className={`${card} flex items-start gap-3.5 p-5`}>
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
