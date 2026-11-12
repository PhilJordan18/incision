"use client";

import { guestAwareAction } from "@/identity/guest-browser";
import { guestChangeRoomBotAction } from "@/server/rooms/guest-actions";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import type { Locale } from "@/i18n/locale";
import { roomBotsCopy } from "@/i18n/room-bots";
import type { PublicRoomSnapshot } from "@/rooms/protocol";
import { changeRoomBotAction, type BotActionState } from "@/server/rooms/bot-actions";
import { card, discreetButton, monoLabel } from "@/components/ui/styles";

import { AddRoomBot } from "./add-room-bot";
import { RoomBotRow } from "./room-bot-row";

export function RoomBotsPanel({ guest = false, snapshot, host, live, locale, refresh }: {
  readonly guest?: boolean;
  readonly snapshot: PublicRoomSnapshot; readonly host: boolean; readonly live: boolean; readonly locale: Locale; readonly refresh: () => void;
}) {
  const t = roomBotsCopy(locale);
  const id = useId();
  const [answer, setAnswer] = useState<BotActionState>({});
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
  return <section aria-labelledby={`${id}-title`} className={`${card} flex flex-col gap-4`}>
    <h2 id={`${id}-title`} className={monoLabel}>{t.title}</h2>
    {host && <AddRoomBot t={t} enabled={enabled} submit={submit} buttonRef={addButton} />}
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{t.roster}</h3>
      {(snapshot.bots?.length ?? 0) === 0 ? <p className="text-brume">{t.empty}</p> : <ul className="flex flex-col gap-3">
        {snapshot.bots?.map((bot, index) => <RoomBotRow key={bot.botId} bot={bot} index={index} t={t} host={host} enabled={enabled} submit={submit} />)}
      </ul>}
    </div>
    {host && !live && <p role="status" className="text-brume">{t.disconnected}</p>}
    <p role="status">{pending ? t.pending : awaiting ? t.waiting : confirmation}</p>
    {answer.error && <div><p role="alert" className="text-erreur">{t.errors[answer.error]}</p>
      <button type="button" className={discreetButton} onClick={() => { setAnswer({}); refresh(); }}>{t.reload}</button></div>}
  </section>;
}
