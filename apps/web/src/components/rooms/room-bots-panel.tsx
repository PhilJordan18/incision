"use client";

import { guestAwareAction } from "@/identity/guest-browser";
import { guestChangeRoomBotAction } from "@/server/rooms/guest-actions";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import type { Locale } from "@/i18n/locale";
import { roomBotsCopy } from "@/i18n/room-bots";
import type { PublicRoomSnapshot } from "@/rooms/protocol";
import { changeRoomBotAction, type BotActionState } from "@/server/rooms/bot-actions";
import { card, discreetButton, panelTitle } from "@/components/ui/styles";
import { formatNumber } from "@/i18n/value-format";

import { AddRoomBot } from "./add-room-bot";
import { RoomBotRow } from "./room-bot-row";

export function RoomBotsPanel({ guest = false, snapshot, host, live, locale, refresh }: {
  readonly guest?: boolean;
  readonly snapshot: PublicRoomSnapshot; readonly host: boolean; readonly live: boolean; readonly locale: Locale; readonly refresh: () => void;
}) {
  const t = roomBotsCopy(locale);
  const id = useId();
  const [answer, setAnswer] = useState<BotActionState>({});
  // The line the last request concerned (DA2-5b): its refusal is read there. Adding concerns no line.
  const [target, setTarget] = useState<string>();
  // Whether that request was a level save: only its confirmation closes the line that sent it.
  const [savingLevel, setSavingLevel] = useState(false);
  const panelReload = useRef<HTMLButtonElement>(null);
  const [confirmation, setConfirmation] = useState("");
  const [pending, transition] = useTransition();
  const submitting = useRef(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const awaiting = answer.revision !== undefined && snapshot.revision < answer.revision;
  const enabled = host && live && snapshot.phase === "waiting" && !pending && !awaiting && answer.error === undefined;
  useEffect(() => {
    if (restoreFocus.current && enabled) { restoreFocus.current = false; addButton.current?.focus(); }
  }, [enabled]);

  function submit(form: FormData) {
    if (!enabled || submitting.current) return;
    form.set("code", snapshot.code);
    form.set("revision", String(snapshot.revision));
    submitting.current = true;
    setAnswer({});
    setTarget(form.get("kind") === "add" ? undefined : String(form.get("botId")));
    setSavingLevel(form.get("kind") === "level");
    setConfirmation("");
    transition(async () => {
      try {
        const result = await guestAwareAction(guest, () => guest ? guestChangeRoomBotAction(form) : changeRoomBotAction(form));
        setAnswer(result.error !== undefined || result.revision !== undefined ? result : { error: "UNAVAILABLE" });
        if (result.revision !== undefined) {
          const kind = form.get("kind");
          setConfirmation(kind === "add" ? t.added : kind === "level" ? t.saved : t.removed);
          if (kind === "remove") restoreFocus.current = true;
        }
      } catch (error) {
        unstable_rethrow(error);
        setAnswer({ error: "UNAVAILABLE" });
      } finally { submitting.current = false; }
    });
  }
  const count = snapshot.bots?.length ?? 0;
  // A refusal about a line that is still listed shows on that line; any other one under the add block.
  const onLine = answer.error !== undefined && target !== undefined && snapshot.bots?.some((bot) => bot.botId === target) === true;
  const reload = () => { setAnswer({}); refresh(); };
  // A refusal shown here (adding, or a line that is gone) disabled the control that had the focus: its way out takes it.
  const panelRefusal = answer.error !== undefined && !onLine;
  useEffect(() => {
    if (panelRefusal) panelReload.current?.focus();
  }, [panelRefusal]);
  // DA2-5: the add block, then what the panel answers, then the roster on the panel's full width.
  return <section aria-labelledby={`${id}-title`} className={`${card} flex min-w-0 flex-col gap-4`}>
    <h2 id={`${id}-title`} className={panelTitle}>{t.title}</h2>
    {host && <AddRoomBot t={t} enabled={enabled} submit={submit} buttonRef={addButton} />}
    {host && !live && <p role="status" className="text-brume">{t.disconnected}</p>}
    <p role="status" className="text-sm text-embrun empty:-mt-4">{pending ? t.pending : awaiting ? t.waiting : confirmation}</p>
    {answer.error && !onLine && <div className="flex flex-col items-start gap-2 border-l-[3px] border-erreur pl-2.5"><p role="alert" className="text-erreur"><span aria-hidden="true">⚠ </span>{t.errors[answer.error]}</p>
      <button ref={panelReload} type="button" className={discreetButton} onClick={reload}>{t.reload}</button></div>}
    <div className="rounded-carte border border-houle bg-abysse">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h3 className="font-semibold">{t.roster}</h3>
        <span className="rounded-puce border-[1.5px] border-ecume px-2 font-mono text-sm">{formatNumber(count, locale)}</span>
      </div>
      {count === 0 ? <p className="border-t border-houle p-4 text-brume">{t.empty}</p> : <ul className="flex flex-col border-t border-houle divide-y divide-sillage">
        {snapshot.bots?.map((bot, index) => <RoomBotRow key={bot.botId} bot={bot} index={index} t={t} host={host} enabled={enabled} submit={submit}
          error={onLine && target === bot.botId ? answer.error : undefined} reload={reload}
          confirmed={savingLevel && target === bot.botId && answer.revision !== undefined && !awaiting ? answer.revision : undefined}
          saving={target === bot.botId && (pending || awaiting)} />)}
      </ul>}
    </div>
  </section>;
}
