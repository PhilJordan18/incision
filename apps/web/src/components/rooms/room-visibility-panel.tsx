"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import type { RoomVisibility } from "@incision/domain";
import { guestAwareAction } from "@/identity/guest-browser";
import { changeVisibilityAction, guestChangeVisibilityAction, type VisibilityActionState } from "@/server/rooms/visibility-actions";
import { roomVisibilityCopy } from "@/i18n/room-visibility";
import type { Locale } from "@/i18n/locale";
import { card, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";
import { VisibilityChoices } from "./visibility-choices";

type Props = { readonly code: string; readonly visibility: RoomVisibility; readonly revision: number; readonly host: boolean;
  readonly guest: boolean; readonly live: boolean; readonly locale: Locale; readonly refresh: () => void };

/** Every member sees who may enter next; the host changes it in the waiting room (SALLE-03, CONF-11, CONF-12). */
export function RoomVisibilityPanel({ code, visibility, revision, host, guest, live, locale, refresh }: Props) {
  const t = roomVisibilityCopy(locale);
  const id = useId();
  const edit = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const focusChoice = useCallback((element: HTMLFormElement | null) => {
    element?.querySelector<HTMLInputElement>("input[type=radio]:checked")?.focus();
  }, []);
  // A refused save disables the form under the focus: the way out (refresh) takes it.
  const focusRefresh = useCallback((element: HTMLButtonElement | null) => {
    if (element !== null && document.activeElement === document.body) element.focus();
  }, []);
  const busy = useRef(false);
  const [draft, setDraft] = useState<{ visibility: RoomVisibility; revision: number } | null>(null);
  const [answer, setAnswer] = useState<VisibilityActionState>({});
  const [pending, startTransition] = useTransition();
  const awaiting = answer.revision !== undefined && revision < answer.revision;
  const conflict = draft !== null && draft.revision !== revision;
  const enabled = host && live && !pending && !awaiting && answer.error === undefined;
  useEffect(() => {
    if (restoreFocus.current && draft === null && enabled) {
      edit.current?.focus();
      restoreFocus.current = false;
    }
  }, [draft, enabled]);
  function reset() { restoreFocus.current = true; setDraft(null); setAnswer({}); }
  function save() {
    if (!enabled || conflict || draft === null || draft.visibility === visibility || busy.current) return;
    const form = new FormData();
    form.set("code", code); form.set("revision", String(draft.revision)); form.set("visibility", draft.visibility);
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await guestAwareAction(guest, () => guest ? guestChangeVisibilityAction(form) : changeVisibilityAction(form));
        setAnswer(result.error !== undefined || result.revision !== undefined ? result : { error: "UNAVAILABLE" });
        if (result.error === undefined && result.revision !== undefined) { restoreFocus.current = true; setDraft(null); }
      } catch (error) { unstable_rethrow(error); setAnswer({ error: "UNAVAILABLE" }); }
      finally { busy.current = false; }
    });
  }
  return <section className={`${card} flex flex-col gap-4`} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={monoLabel}>{t.title}</h2>
    <div aria-live="polite">
      <p><span className="text-brume">{t.current} </span><strong className="font-semibold">{t.choices[visibility].label}</strong></p>
      <p className="text-sm text-embrun">{t.choices[visibility].body}</p>
    </div>
    {host && <button ref={edit} type="button" className={`${discreetButton} self-start`} disabled={!enabled || draft !== null}
      onClick={() => { setDraft({ visibility, revision }); setAnswer({}); }}>{t.edit}</button>}
    {host && !live && <p role="status">{t.disconnected}</p>}
    {host && draft !== null && <form ref={focusChoice} className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
      <VisibilityChoices locale={locale} name={`${id}-visibility`} value={draft.visibility} disabled={!enabled || conflict}
        describedBy={`${id}-stay`} onChange={(next) => setDraft({ ...draft, visibility: next })} />
      <p id={`${id}-stay`} className="text-sm text-brume">{t.membersStay}</p>
      <div className="flex flex-wrap gap-3"><button type="submit" className={secondaryButton} disabled={!enabled || conflict || draft.visibility === visibility}>{t.save}</button>
        <button type="button" className={discreetButton} disabled={pending} onClick={reset}>{t.cancel}</button></div>
    </form>}
    {(conflict || answer.error !== undefined) && <p role="alert" className="text-erreur">⚠ {t.errors[answer.error ?? "STALE_REVISION"]}</p>}
    {answer.revision !== undefined && <p role="status">{awaiting ? t.waiting : t.saved}</p>}
    {(conflict || answer.error !== undefined || awaiting) && <button ref={focusRefresh} type="button" className={`${discreetButton} self-start`} disabled={pending}
      onClick={() => { reset(); refresh(); }}>{t.reload}</button>}
  </section>;
}
