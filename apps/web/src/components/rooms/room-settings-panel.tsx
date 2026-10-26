"use client";

import { unstable_rethrow } from "next/navigation";
import { useCallback, useId, useRef, useState, useTransition } from "react";
import { TIME_LIMIT_MIN_MS } from "@incision/domain";
import { card, discreetButton, fieldLabel, monoLabel, secondaryButton, textField } from "@/components/ui/styles";
import type { Locale } from "@/i18n/locale";
import { roomSettingsCopy } from "@/i18n/room-settings";
import { configureRoomAction, type ConfigureRoomState } from "@/server/rooms/actions";
import { RUNNABLE_TIME_LIMIT_MAX_MS } from "@/server/rooms/room-settings";
import { awaitingSettings, draftConflict, editableSettings, settingsDraft, settingsForm, validDraft, type SavedRoomSettings, type SettingsDraft } from "./room-settings-state";

type Props = {
  readonly code: string;
  readonly settings: SavedRoomSettings | undefined;
  readonly host: boolean;
  readonly live: boolean;
  readonly locale: Locale;
  readonly refresh: () => void;
};

/** Waiting-room only. The snapshot, never the draft or action ack, supplies the public summary. */
export function RoomSettingsPanel({ code, settings, host, live, locale, refresh }: Props) {
  const t = roomSettingsCopy(locale);
  const id = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [answer, setAnswer] = useState<ConfigureRoomState>({});
  const [pending, startTransition] = useTransition();
  const focusLanguage = useCallback((element: HTMLSelectElement | null) => { element?.focus(); }, []);
  const supported = editableSettings(settings);
  const awaiting = awaitingSettings(answer.revision, settings);
  const conflict = draftConflict(draft, settings) || answer.error === "STALE_REVISION";
  // Unknown outcomes require an explicit read, never an automatic resubmission.
  const uncertain = answer.error === "UNAVAILABLE";
  const canEdit = host && live && supported && !pending && !awaiting;

  function cancel() {
    if (submitting.current) return;
    setDraft(null);
    setAnswer({});
    editButton.current?.focus();
  }

  function reload() {
    if (submitting.current) return;
    // Discard only on the host's explicit request; the next edit takes the latest snapshot.
    setDraft(null);
    setAnswer({});
    refresh();
    editButton.current?.focus();
  }

  function save() {
    if (!canEdit || draft === null || conflict || uncertain || !validDraft(draft) || submitting.current) return;
    const form = settingsForm(code, draft);
    submitting.current = true;
    setAnswer({});
    startTransition(async () => {
      try {
        const result = await configureRoomAction(form);
        // A malformed/empty reply is not evidence of success.
        setAnswer(result.error !== undefined || result.revision !== undefined ? result : { error: "UNAVAILABLE" });
        if (result.error === undefined && result.revision !== undefined) {
          setDraft(null);
          editButton.current?.focus();
        }
      } catch (error) {
        unstable_rethrow(error);
        setAnswer({ error: "UNAVAILABLE" });
      } finally {
        submitting.current = false;
      }
    });
  }

  return (
    <section aria-labelledby={`${id}-heading`} className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className={monoLabel}>{t.title}</h2>
        {host && <button ref={editButton} type="button" className={discreetButton} aria-disabled={!canEdit || draft !== null}
          onClick={() => { if (canEdit && draft === null && editableSettings(settings)) { setDraft(settingsDraft(settings)); setAnswer({}); } }}>
          {t.edit}
        </button>}
      </div>
      {settings === undefined ? <p className="text-brume">{t.unavailable}</p> : (
        <dl className="flex flex-wrap gap-4 text-sm" aria-live="polite" aria-atomic="true">
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.language}</dt><dd>{settings.textLanguage === "fr" ? t.french : t.english}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.duration}</dt><dd>{settings.timeLimitMs === null ? t.unlimited : settings.timeLimitMs / 1000}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.mode}</dt><dd>{settings.errorMode === "mandatory" ? t.mandatory : t.free}</dd></div>
        </dl>
      )}
      {settings !== undefined && !supported && <p className="text-brume">{t.unsupported}</p>}
      {host && !live && <p role="status" className="text-brume">{t.disconnected}</p>}
      {draft !== null && host && (
        <form onSubmit={(event) => { event.preventDefault(); save(); }}
          onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); cancel(); } }}
          className="flex flex-col gap-4" aria-describedby={`${id}-hint`}>
          <fieldset disabled={!canEdit || conflict || uncertain} className="grid min-w-0 gap-4 sm:grid-cols-2">
            <legend className="sr-only">{t.edit}</legend>
            <label className={`${fieldLabel} flex flex-col gap-2`} htmlFor={`${id}-language`}>{t.language}
              <select ref={focusLanguage} id={`${id}-language`} className={textField} value={draft.textLanguage}
                onChange={(event) => setDraft({ ...draft, textLanguage: event.target.value === "en" ? "en" : "fr" })}>
                <option value="fr">{t.french}</option><option value="en">{t.english}</option>
              </select>
            </label>
            <label className={`${fieldLabel} flex flex-col gap-2`} htmlFor={`${id}-seconds`}>{t.duration}
              <input id={`${id}-seconds`} className={textField} type="number" min={TIME_LIMIT_MIN_MS / 1000}
                max={RUNNABLE_TIME_LIMIT_MAX_MS / 1000} step="1" required value={draft.seconds}
                onChange={(event) => setDraft({ ...draft, seconds: event.target.value })} />
            </label>
          </fieldset>
          <p id={`${id}-hint`} className="text-sm text-brume">{t.hint}</p>
          {conflict && <p role="alert" className="text-sm text-or">⚠ {t.conflict}</p>}
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={secondaryButton} disabled={!canEdit || conflict || uncertain || !validDraft(draft)}>{pending ? t.saving : t.save}</button>
            <button type="button" onClick={cancel} disabled={pending} className={discreetButton}>{t.cancel}</button>
          </div>
        </form>
      )}
      {answer.error !== undefined && <p role="alert" className="text-sm text-erreur">⚠ {t.errors[answer.error]}</p>}
      {answer.revision !== undefined && <p role="status" className="text-sm text-embrun">{awaiting ? t.waiting : t.saved}</p>}
      {(conflict || uncertain || awaiting || settings === undefined) && <button type="button" disabled={pending} onClick={reload} className={`${discreetButton} self-start`}>{t.reload}</button>}
    </section>
  );
}
