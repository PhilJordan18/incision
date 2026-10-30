"use client";

import { useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { unstable_rethrow } from "next/navigation";
import { guestAwareAction } from "@/identity/guest-browser";
import { expelMemberAction, guestExpelMemberAction, type ModerationActionState } from "@/server/rooms/moderation-actions";
import { roomModerationCopy } from "@/i18n/room-moderation";
import type { Locale } from "@/i18n/locale";
import type { PublicRoomSnapshot } from "@/rooms/protocol";
import { card, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";

export function RoomModerationPanel({ snapshot, guest, live, locale, refresh }: {
  readonly snapshot: PublicRoomSnapshot; readonly guest: boolean; readonly live: boolean;
  readonly locale: Locale; readonly refresh: () => void;
}) {
  const t = roomModerationCopy(locale), id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const restoreTrigger = useRef(false);
  const busy = useRef(false);
  const focusCancel = useCallback((element: HTMLButtonElement | null) => { element?.focus(); }, []);
  const [draft, setDraft] = useState<{ memberId: string; name: string; revision: number } | null>(null);
  const [answer, setAnswer] = useState<ModerationActionState>({});
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    // Wait for React to re-enable the trigger before returning keyboard focus.
    if (draft === null && restoreTrigger.current) {
      restoreTrigger.current = false;
      trigger.current?.focus();
    }
  }, [draft]);
  const conflict = draft !== null && draft.revision !== snapshot.revision;
  const awaiting = answer.revision !== undefined && snapshot.revision < answer.revision;
  const enabled = live && !pending && !awaiting && answer.error === undefined;
  function confirm() {
    if (draft === null || !enabled || conflict || busy.current) return;
    const form = new FormData();
    form.set("code", snapshot.code); form.set("memberId", draft.memberId); form.set("revision", String(draft.revision));
    busy.current = true;
    startTransition(async () => {
      try {
        const result = await guestAwareAction(guest, () => guest ? guestExpelMemberAction(form) : expelMemberAction(form));
        setAnswer(result);
        if (result.revision !== undefined) { setDraft(null); heading.current?.focus(); }
      } catch (error) { unstable_rethrow(error); setAnswer({ error: "UNAVAILABLE" }); }
      finally { busy.current = false; }
    });
  }
  return <section className={`${card} flex flex-col gap-4`} aria-labelledby={`${id}-title`}>
    <h2 ref={heading} tabIndex={-1} id={`${id}-title`} className={monoLabel}>{t.title}</h2>
    {!live && <p role="status">{t.disconnected}</p>}
    <ul className="flex flex-col gap-3">{snapshot.members.filter((member) => !member.isHost).map((member) =>
      <li key={member.memberId} className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0 break-words">{member.displayName}</span>
        <button type="button" className={discreetButton} disabled={!enabled || draft !== null}
          aria-label={`${t.expel} ${member.displayName}`} onClick={(event) => {
            trigger.current = event.currentTarget; setAnswer({});
            setDraft({ memberId: member.memberId, name: member.displayName, revision: snapshot.revision });
          }}>{t.expel}</button>
      </li>)}</ul>
    {draft !== null && <div className="flex flex-col gap-3" role="group" aria-label={`${t.expel} ${draft.name}`}>
      <p className="break-words">{draft.name} — {t.warning}</p>
      <div className="flex flex-wrap gap-3">
        <button ref={focusCancel} type="button" className={discreetButton} disabled={pending}
          onClick={() => { restoreTrigger.current = true; setDraft(null); setAnswer({}); }}>{t.cancel}</button>
        <button type="button" className={secondaryButton} disabled={!enabled || conflict} onClick={confirm}>{t.confirm}</button>
      </div>
    </div>}
    {(conflict || answer.error !== undefined) && <p role="alert" className="text-erreur">⚠ {t.errors[answer.error ?? "STALE_REVISION"]}</p>}
    {answer.revision !== undefined && <p role="status">{t.saved}</p>}
    {(conflict || answer.error !== undefined || awaiting) && <button type="button" className={`${discreetButton} self-start`} disabled={pending}
      onClick={() => { setDraft(null); setAnswer({}); refresh(); }}>{t.reload}</button>}
  </section>;
}
