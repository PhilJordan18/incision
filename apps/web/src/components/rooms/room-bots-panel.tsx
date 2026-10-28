"use client";

import { BOT_LEVELS } from "@incision/domain";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import type { Locale } from "@/i18n/locale";
import { roomBotsCopy } from "@/i18n/room-bots";
import type { PublicRoomSnapshot } from "@/rooms/protocol";
import { changeRoomBotAction, type BotActionState } from "@/server/rooms/bot-actions";
import { card, discreetButton, fieldLabel, monoLabel, secondaryButton, textField } from "@/components/ui/styles";

export function RoomBotsPanel({ snapshot, host, live, locale, refresh }: {
  readonly snapshot: PublicRoomSnapshot; readonly host: boolean; readonly live: boolean; readonly locale: Locale; readonly refresh: () => void;
}) {
  const t = roomBotsCopy(locale);
  const id = useId();
  const [answer, setAnswer] = useState<BotActionState>({});
  const [pending, transition] = useTransition();
  const submitting = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const awaiting = answer.revision !== undefined && snapshot.revision < answer.revision;
  const enabled = host && live && snapshot.phase === "waiting" && !pending && !awaiting && answer.error === undefined;
  const options = BOT_LEVELS.map((level) => <option key={level} value={level}>{t.levels[level]}</option>);
  useEffect(() => {
    if (restoreFocus.current && enabled) { restoreFocus.current = false; addButton.current?.focus(); }
  }, [enabled]);

  function submit(form: FormData) {
    if (!enabled || submitting.current) return;
    form.set("code", snapshot.code);
    form.set("revision", String(snapshot.revision));
    submitting.current = true;
    setAnswer({});
    transition(async () => {
      try {
        const result = await changeRoomBotAction(form);
        setAnswer(result.error !== undefined || result.revision !== undefined ? result : { error: "UNAVAILABLE" });
        if (result.revision !== undefined && form.get("kind") === "remove") restoreFocus.current = true;
      } catch (error) {
        unstable_rethrow(error);
        setAnswer({ error: "UNAVAILABLE" });
      } finally { submitting.current = false; }
    });
  }
  return <section aria-labelledby={`${id}-title`} className={`${card} flex flex-col gap-4`}>
    <h2 id={`${id}-title`} className={monoLabel}>{t.title}</h2>
    {(snapshot.bots?.length ?? 0) === 0 ? <p className="text-brume">{t.empty}</p> : <ul className="flex flex-col gap-3">
      {snapshot.bots?.map((bot, index) => <li key={bot.botId} className="flex flex-col gap-2 border-b border-houle pb-3">
        <p><span aria-hidden="true" className="mr-2 inline-block h-3 w-3 bg-brume" />{t.label} {index + 1} · {t.levels[bot.level]}</p>
        {host && <div className="flex flex-wrap items-end gap-2">
          <form key={`${bot.botId}-${bot.level}`} onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
            <input type="hidden" name="kind" value="level" /><input type="hidden" name="botId" value={bot.botId} />
            <label className={`${fieldLabel} min-w-0 max-w-full`}>{t.level} {index + 1}<select name="level" defaultValue={bot.level} disabled={!enabled} className={`${textField} block max-w-full`}>{options}</select></label>
            <button disabled={!enabled} className={discreetButton}>{t.save}</button>
          </form>
          <button type="button" disabled={!enabled} className={discreetButton} aria-label={`${t.remove} ${t.label} ${index + 1}`} onClick={() => {
            const form = new FormData(); form.set("kind", "remove"); form.set("botId", bot.botId); submit(form);
          }}>{t.remove}</button>
        </div>}
      </li>)}
    </ul>}
    {host && <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value="add" />
      <label className={`${fieldLabel} min-w-0 max-w-full`}>{t.level}<select name="level" defaultValue="beginner" disabled={!enabled} className={`${textField} block max-w-full`}>{options}</select></label>
      <button ref={addButton} disabled={!enabled} className={secondaryButton}>{t.add}</button>
    </form>}
    {host && !live && <p role="status" className="text-brume">{t.disconnected}</p>}
    <p role="status">{pending ? t.pending : awaiting ? t.waiting : ""}</p>
    {answer.error && <div><p role="alert" className="text-erreur">{t.errors[answer.error]}</p>
      <button type="button" className={discreetButton} onClick={() => { setAnswer({}); refresh(); }}>{t.reload}</button></div>}
  </section>;
}
