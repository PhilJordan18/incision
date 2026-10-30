"use client";

import { useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { ROOM_MIN_CAPACITY, ROOM_MAX_CAPACITY } from "@incision/domain";
import { guestAwareAction } from "@/identity/guest-browser";
import { changeCapacityAction, guestChangeCapacityAction, type CapacityActionState } from "@/server/rooms/capacity-actions";
import { roomAccessCopy } from "@/i18n/room-access";
import type { Locale } from "@/i18n/locale";
import { card, discreetButton, fieldLabel, monoLabel, secondaryButton, textField } from "@/components/ui/styles";

type Props = { readonly code: string; readonly capacity: number; readonly revision: number; readonly host: boolean;
  readonly guest: boolean; readonly live: boolean; readonly locale: Locale; readonly refresh: () => void };

export function RoomCapacityPanel({ code, capacity, revision, host, guest, live, locale, refresh }: Props) {
  const t = roomAccessCopy(locale);
  const id = useId();
  const edit = useRef<HTMLButtonElement>(null);
  const busy = useRef(false);
  const [draft, setDraft] = useState<{ capacity: string; revision: number } | null>(null);
  const [answer, setAnswer] = useState<CapacityActionState>({});
  const [pending, startTransition] = useTransition();
  const awaiting = answer.revision !== undefined && revision < answer.revision;
  const conflict = draft !== null && draft.revision !== revision;
  const valid = draft !== null && /^\d{1,2}$/.test(draft.capacity) && Number(draft.capacity) >= ROOM_MIN_CAPACITY && Number(draft.capacity) <= ROOM_MAX_CAPACITY;
  const enabled = host && live && !pending && !awaiting && answer.error === undefined;
  function reset() { setDraft(null); setAnswer({}); edit.current?.focus(); }
  function save() {
    if (!enabled || !valid || conflict || draft === null || busy.current) return;
    const form = new FormData();
    form.set("code", code); form.set("revision", String(draft.revision)); form.set("capacity", draft.capacity);
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await guestAwareAction(guest, () => guest ? guestChangeCapacityAction(form) : changeCapacityAction(form));
        setAnswer(result.error !== undefined || result.revision !== undefined ? result : { error: "UNAVAILABLE" });
        if (result.error === undefined && result.revision !== undefined) { setDraft(null); edit.current?.focus(); }
      } catch (error) { unstable_rethrow(error); setAnswer({ error: "UNAVAILABLE" }); }
      finally { busy.current = false; }
    });
  }
  return <section className={`${card} flex flex-col gap-4`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={monoLabel}>{t.title}</h2>
    <p aria-live="polite">{t.capacity} : {capacity}</p>
    <p id={`${id}-hint`} className="text-sm text-brume">{t.hint}</p>
    {host && draft === null && <button ref={edit} type="button" className={`${discreetButton} self-start`} disabled={!enabled}
      onClick={() => { setDraft({ capacity: String(capacity), revision }); setAnswer({}); }}>{t.edit}</button>}
    {host && !live && <p role="status">{t.disconnected}</p>}
    {host && draft !== null && <form className="flex flex-col gap-3" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <label className={fieldLabel} htmlFor={`${id}-capacity`}>{t.capacity}</label>
      <input id={`${id}-capacity`} className={textField} type="number" min={ROOM_MIN_CAPACITY} max={ROOM_MAX_CAPACITY} step="1" required
        value={draft.capacity} disabled={!enabled || conflict} aria-describedby={`${id}-hint`}
        onChange={(event) => setDraft({ ...draft, capacity: event.target.value })} />
      <div className="flex flex-wrap gap-3"><button type="submit" className={secondaryButton} disabled={!enabled || !valid || conflict}>{t.save}</button>
        <button type="button" className={discreetButton} disabled={pending} onClick={() => { setDraft(null); edit.current?.focus(); }}>{t.cancel}</button></div>
    </form>}
    {(conflict || answer.error !== undefined) && <p role="alert" className="text-erreur">⚠ {t.errors[answer.error ?? "STALE_REVISION"]}</p>}
    {answer.revision !== undefined && <p role="status">{awaiting ? t.waiting : t.saved}</p>}
    {(conflict || answer.error !== undefined || awaiting) && <button type="button" className={`${discreetButton} self-start`} disabled={pending}
      onClick={() => { reset(); refresh(); }}>{t.reload}</button>}
  </section>;
}
