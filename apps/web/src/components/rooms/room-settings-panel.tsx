"use client";

import { guestAwareAction } from "@/identity/guest-browser";
import { guestConfigureRoomAction } from "@/server/rooms/guest-actions";

import { unstable_rethrow } from "next/navigation";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState, useTransition } from "react";
import { COMPLEXITIES, TIME_LIMIT_MIN_MS, TIME_LIMIT_MAX_MS, MIN_TEXT_WORDS, MAX_TEXT_WORDS } from "@incision/domain";
import { FieldError } from "@/components/ui/field-error";
import { card, discreetButton, fieldLabel, panelTitle, secondaryButton, textField } from "@/components/ui/styles";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { roomSettingsCopy } from "@/i18n/room-settings";
import { configureRoomAction, type ConfigureRoomState } from "@/server/rooms/actions";
import { UnsavedTag } from "./unsaved-tag";
import {
  awaitingSettings,
  draftConflict,
  draftTextRefusal,
  editableSettings,
  MAX_CHARACTERS_INPUT,
  pendingFields,
  refusalApplies,
  refusalConcernsOptions,
  refusalFields,
  requiresSettingsRefresh,
  settingsDraft,
  settingsForm,
  TEXT_OPTIONS,
  validDraft,
  validSeconds,
  validWordCount,
  type SavedRoomSettings,
  type SettingsDraft,
  type SettingsField,
} from "./room-settings-state";

type Copy = ReturnType<typeof roomSettingsCopy>;

type Props = {
  readonly guest?: boolean;
  readonly code: string;
  readonly settings: SavedRoomSettings | undefined;
  readonly host: boolean;
  readonly live: boolean;
  readonly locale: Locale;
  readonly refresh: () => void;
};

/** The control that takes the focus for a field in error: the first option for the options, the field itself otherwise. */
const CONTROL: Record<SettingsField, string> = {
  textLanguage: "language", textKind: "kind", complexity: "complexity", wordCount: "words", options: "option-punctuation",
  include: "include", exclude: "exclude", seconds: "seconds", errorMode: "mode", bonusesEnabled: "game",
};

/** A field of the form: a disabled one (conflict, disconnection, « Aucune limite ») reads as disabled. */
const formField = `${textField} disabled:cursor-not-allowed disabled:border-transparent disabled:bg-sillage disabled:text-voile`;
const group = "min-w-0 rounded-carte border border-houle px-4 pt-2 pb-4";
const legend = "px-2 font-mono text-[11px] font-medium tracking-[0.2em] text-embrun uppercase";

/** The saved value of a field in words, as the summary writes it. */
function savedWords(field: SettingsField, settings: SavedRoomSettings, t: Copy): string {
  switch (field) {
    case "textLanguage": return settings.textLanguage === "fr" ? t.french : t.english;
    case "textKind": return settings.textKind === "random" ? t.random : t.coherent;
    case "complexity": return t[settings.complexity];
    case "wordCount": return String(settings.wordCount);
    case "options": return TEXT_OPTIONS.filter((option) => settings[option]).map((option) => t[option].toLowerCase()).join(", ") || t.optionsNone;
    case "include": return (settings.textKind === "random" ? settings.includeCharacters.join(" ") : "") || t.none;
    case "exclude": return (settings.textKind === "random" ? settings.excludeCharacters.join(" ") : "") || t.none;
    case "seconds": return settings.timeLimitMs === null ? t.unlimited : format(t.savedSeconds, { seconds: settings.timeLimitMs / 1000 });
    case "errorMode": return settings.errorMode === "mandatory" ? t.mandatory : t.free;
    case "bonusesEnabled": return settings.bonusesEnabled ? t.arcade : t.training;
  }
}

/** Space-separated ids for `aria-describedby`, without the absent ones. */
function ids(...values: readonly (string | false | undefined)[]): string | undefined {
  return values.filter((value) => typeof value === "string").join(" ") || undefined;
}

/**
 * Waiting-room only. The snapshot, never the draft or action ack, supplies the public summary.
 * The edit form (DA2-8) groups the fields as text, duration, typing mode and game mode; a field
 * whose draft differs from the saved value says so with a tag and the saved value in words, and
 * an error sits beside the field it concerns. The rules live in `room-settings-state.ts`.
 */
export function RoomSettingsPanel({ guest = false, code, settings, host, live, locale, refresh }: Props) {
  const t = roomSettingsCopy(locale);
  const id = useId();
  const editButton = useRef<HTMLButtonElement>(null);
  const saveButton = useRef<HTMLButtonElement>(null);
  const submitting = useRef(false);
  const [draft, setDraft] = useState<SettingsDraft | null>(null);
  const [answer, setAnswer] = useState<ConfigureRoomState>({});
  // The draft the server answered about: its refusal stays beside the field until that draft changes.
  const [answered, setAnswered] = useState<SettingsDraft | null>(null);
  const [pending, startTransition] = useTransition();
  const focusLanguage = useCallback((element: HTMLSelectElement | null) => { element?.focus(); }, []);
  const supported = editableSettings(settings);
  const awaiting = awaitingSettings(answer.revision, settings);
  const conflict = draftConflict(draft, settings) || answer.error === "STALE_REVISION";
  // Unknown outcomes require an explicit read, never an automatic resubmission.
  const uncertain = answer.error === "UNAVAILABLE";
  const needsRefresh = requiresSettingsRefresh(answer.error);
  const canEdit = host && live && supported && !pending && !awaiting && !needsRefresh;
  const draftRefusal = draft === null ? undefined : draftTextRefusal(draft);
  // The server's refusal of this very draft about its text (random words): shown where the browser's own would be.
  const serverRefusal = draft !== null && answered !== null && answer.error === "TEXT_SETTINGS_REFUSED" && answer.textProblem !== undefined
    && refusalApplies(answer.textProblem, answered, draft) ? answer.textProblem : undefined;
  // A refusal about the draft's text belongs beside its field while the form is open: once a field
  // it names changes it no longer applies, and it does not come back as a panel message.
  const fieldRefusal = draft !== null && answer.error === "TEXT_SETTINGS_REFUSED" && answer.textProblem !== undefined;
  const refusal = draftRefusal ?? serverRefusal;
  const refused = refusal === undefined ? [] : refusalFields(refusal);
  const wordsInvalid = draft !== null && !validWordCount(draft);
  const secondsInvalid = draft !== null && !validSeconds(draft);
  const changes = draft === null || settings === undefined ? [] : pendingFields(draft, settings);

  // A refused save loses the disabled button's focus: it goes to the first field in error, or
  // back to the button when the refusal concerns no single field (it is read in the form's alert).
  const [refusedAttempt, setRefusedAttempt] = useState(0);
  const focusedAttempt = useRef(0);
  const firstRefused = refused[0];
  useEffect(() => {
    // Only a new refused save moves the focus, never a later edit of the draft; and only once the
    // form is enabled again (it is disabled while the save is on its way).
    if (refusedAttempt === focusedAttempt.current || pending) return;
    focusedAttempt.current = refusedAttempt;
    const target = firstRefused === undefined ? saveButton.current : document.getElementById(`${id}-${CONTROL[firstRefused]}`);
    target?.focus();
  }, [refusedAttempt, pending, firstRefused, id]);

  // A refusal that asks to read the settings again disables the form under the focus: the way out takes it.
  const reloadButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (needsRefresh && !pending) reloadButton.current?.focus();
  }, [needsRefresh, pending]);

  function cancel() {
    if (submitting.current) return;
    setDraft(null);
    setAnswer((previous) => requiresSettingsRefresh(previous.error) ? previous : {});
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
    const sent = draft;
    submitting.current = true;
    setAnswer({});
    startTransition(async () => {
      try {
        const result = await guestAwareAction(guest, () => guest ? guestConfigureRoomAction(form) : configureRoomAction(form));
        // A malformed/empty reply is not evidence of success.
        const outcome: ConfigureRoomState = result.error !== undefined || result.revision !== undefined ? result : { error: "UNAVAILABLE" };
        setAnswer(outcome);
        setAnswered(sent);
        if (outcome.error === undefined) {
          setDraft(null);
          editButton.current?.focus();
        } else if (!requiresSettingsRefresh(outcome.error)) {
          setRefusedAttempt((attempt) => attempt + 1);
        }
      } catch (error) {
        unstable_rethrow(error);
        setAnswer({ error: "UNAVAILABLE" });
      } finally {
        submitting.current = false;
      }
    });
  }

  /** The tag and the saved value under a field whose draft differs; its id joins the field's description. */
  function pendingMark(field: SettingsField): ReactNode {
    if (settings === undefined || !changes.includes(field)) return null;
    return (
      <p id={`${id}-${field}-pending`} data-pending={field} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-normal text-embrun">
        <UnsavedTag label={t.unsavedTag} />
        <span>{format(t.savedValue, { value: savedWords(field, settings, t) })}</span>
      </p>
    );
  }
  const pendingId = (field: SettingsField) => changes.includes(field) && `${id}-${field}-pending`;
  const refusalId = (field: SettingsField) => refused.includes(field) && `${id}-text-refusal`;
  /** The text refusal, once, beside the first field it concerns. */
  function refusalAt(field: SettingsField): ReactNode {
    if (refusal === undefined || firstRefused !== field) return null;
    // The server's refusal keeps its sentence; the browser's own check has only the reason.
    const message = draftRefusal === undefined ? `${t.errors.TEXT_SETTINGS_REFUSED} ${t.textRefusals[refusal]}` : t.textRefusals[refusal];
    return <p id={`${id}-text-refusal`} role="alert" className="text-sm font-normal text-erreur sm:col-span-2">⚠ {message}</p>;
  }
  const charactersFirst = firstRefused === "include" || firstRefused === "exclude";

  return (
    <section aria-labelledby={`${id}-heading`} className={`${card} flex flex-col gap-4`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={`${id}-heading`} className={panelTitle}>{t.title}</h2>
        {host && <button ref={editButton} type="button" className={`${discreetButton} aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-sillage aria-disabled:text-voile`} aria-disabled={!canEdit || draft !== null} aria-expanded={draft !== null}
          onClick={() => { if (canEdit && draft === null && editableSettings(settings)) { setDraft(settingsDraft(settings)); setAnswer({}); } }}>
          {t.edit}
        </button>}
      </div>
      {settings === undefined ? <p className="text-brume">{t.unavailable}</p> : (
        <dl className="flex flex-wrap gap-3 text-sm" aria-live="polite" aria-atomic="true">
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.language}</dt><dd>{settings.textLanguage === "fr" ? t.french : t.english}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.wordCount}</dt><dd>{settings.wordCount}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.duration}</dt><dd>{settings.timeLimitMs === null ? t.unlimited : settings.timeLimitMs / 1000}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.mode}</dt><dd>{settings.errorMode === "mandatory" ? t.mandatory : t.free}</dd></div>
          <div className={`rounded-puce border px-3 py-2 ${settings.bonusesEnabled ? "border-arcade" : "border-houle"}`}><dt className="text-brume">{t.gameMode}</dt><dd>{settings.bonusesEnabled ? t.arcade : t.training}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.textKind}</dt><dd>{settings.textKind === "random" ? t.random : t.coherent}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.complexity}</dt><dd>{t[settings.complexity]}</dd></div>
          <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.options}</dt>
            <dd>{TEXT_OPTIONS.filter((option) => settings[option]).map((option) => t[option].toLowerCase()).join(", ") || t.optionsNone}</dd></div>
          {settings.textKind === "random" && <>
            <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.include}</dt><dd className="font-mono">{settings.includeCharacters.join(" ") || t.none}</dd></div>
            <div className="rounded-puce border border-houle px-3 py-2"><dt className="text-brume">{t.exclude}</dt><dd className="font-mono">{settings.excludeCharacters.join(" ") || t.none}</dd></div>
          </>}
        </dl>
      )}
      {settings !== undefined && !supported && <p className="text-brume">{t.unsupported}</p>}
      {host && !live && <p role="status" className="text-brume">{t.disconnected}</p>}
      {draft !== null && host && (
        <form onSubmit={(event) => { event.preventDefault(); save(); }}
          onKeyDown={(event) => { if (event.key === "Escape" && !pending) { event.preventDefault(); cancel(); } }}
          className="flex flex-col gap-4 border-t border-sillage pt-4" aria-describedby={`${id}-hint`}>
          {/* Polite and atomic: the count is read when it changes, without taking the place of the save's own status. */}
          <p aria-live="polite" aria-atomic="true" data-pending-count={changes.length} className="text-sm text-embrun">
            {changes.length > 0 && <span aria-hidden="true" className="text-or">⚠ </span>}
            {changes.length === 0 ? t.pendingNone : changes.length === 1 ? t.pendingOne : format(t.pendingMany, { count: changes.length })}
          </p>
          <fieldset disabled={!canEdit || conflict || uncertain} className="grid min-w-0 gap-4 lg:grid-cols-3">
            <legend className="sr-only">{t.edit}</legend>

            <fieldset className={`${group} lg:col-span-3`}>
              <legend className={legend}>{t.groupText}</legend>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                <label className={`${fieldLabel} flex flex-col gap-2`} htmlFor={`${id}-language`}>{t.language}
                  <select ref={focusLanguage} id={`${id}-language`} className={formField} value={draft.textLanguage} aria-describedby={ids(pendingId("textLanguage"))}
                    onChange={(event) => setDraft({ ...draft, textLanguage: event.target.value === "en" ? "en" : "fr" })}>
                    <option value="fr">{t.french}</option><option value="en">{t.english}</option>
                  </select>
                </label>
                  {pendingMark("textLanguage")}
                </div>
                <div className="flex flex-col gap-2">
                  <label className={fieldLabel} htmlFor={`${id}-kind`}>{t.textKind}</label>
                  <select id={`${id}-kind`} className={formField} value={draft.textKind} aria-invalid={refused.includes("textKind") || undefined}
                    aria-describedby={ids(`${id}-kind-hint`, refusalId("textKind"), pendingId("textKind"))}
                    onChange={(event) => setDraft({ ...draft, textKind: event.target.value === "random" ? "random" : "coherent" })}>
                    <option value="coherent">{t.coherent}</option><option value="random">{t.random}</option>
                  </select>
                  <span id={`${id}-kind-hint`} className="text-sm font-normal text-brume">{draft.textKind === "random" ? t.randomHint : t.coherentHint}</span>
                  {refusalAt("textKind")}
                  {pendingMark("textKind")}
                </div>
                <div className="flex flex-col gap-2">
                  <label className={fieldLabel} htmlFor={`${id}-complexity`}>{t.complexity}</label>
                  <select id={`${id}-complexity`} className={formField} value={draft.complexity} aria-invalid={refused.includes("complexity") || undefined}
                    aria-describedby={ids(`${id}-complexity-hint`, refusalId("complexity"), pendingId("complexity"))}
                    onChange={(event) => { const complexity = COMPLEXITIES.find((level) => level === event.target.value); if (complexity !== undefined) setDraft({ ...draft, complexity }); }}>
                    {COMPLEXITIES.map((level) => <option key={level} value={level}>{t[level]}</option>)}
                  </select>
                  <span id={`${id}-complexity-hint`} className="text-sm font-normal text-brume">{draft.textKind === "random" ? t.complexityHint : t.coherentComplexityHint}</span>
                  {refusalAt("complexity")}
                  {pendingMark("complexity")}
                </div>
                <div className="flex flex-col gap-2">
                <label className={`${fieldLabel} flex flex-col gap-2`} htmlFor={`${id}-words`}>{t.wordCount}
                  <input id={`${id}-words`} className={formField} type="number" min={MIN_TEXT_WORDS} max={MAX_TEXT_WORDS}
                    step="1" required value={draft.wordCount} aria-invalid={wordsInvalid || refused.includes("wordCount") || undefined}
                    aria-describedby={ids(`${id}-words-hint`, refusalId("wordCount"), wordsInvalid && refusal === undefined && `${id}-words-error`, pendingId("wordCount"))}
                    onChange={(event) => setDraft({ ...draft, wordCount: event.target.value })} />
                  <span id={`${id}-words-hint`} className="text-sm font-normal text-brume">{t.wordCountHint}</span>
                </label>
                  {refusalAt("wordCount")}
                  {/* A count that is not a number yet has no engine refusal: the same words, beside the field. */}
                  {wordsInvalid && refusal === undefined && <FieldError id={`${id}-words-error`} message={t.textRefusals.WORD_COUNT_OUT_OF_RANGE} />}
                  {pendingMark("wordCount")}
                </div>
                <fieldset className="flex min-w-0 flex-col gap-2 sm:col-span-2">
                  <legend className={`${fieldLabel} mb-2`}>{t.options}</legend>
                  <div className="flex flex-wrap gap-2">
                    {TEXT_OPTIONS.map((option) => (
                      <button key={option} id={`${id}-option-${option}`} type="button" aria-pressed={draft[option]}
                        aria-describedby={ids(refusal !== undefined && refusalConcernsOptions(refusal) && `${id}-text-refusal`, pendingId("options"))}
                        className="inline-flex min-h-11 items-center gap-2 rounded-full border border-houle px-4 text-sm text-embrun transition-colors duration-200 ease-incision hover:text-ecume aria-pressed:border-2 aria-pressed:border-moi aria-pressed:text-moi"
                        onClick={() => setDraft({ ...draft, [option]: !draft[option] })}>
                        <span aria-hidden="true">{draft[option] ? "✓" : "○"}</span>{t[option]}
                      </button>
                    ))}
                  </div>
                  {pendingMark("options")}
                </fieldset>
                {(["include", "exclude"] as const).map((field) => (
                  <div key={field} className="flex flex-col gap-2">
                  <label className={`${fieldLabel} flex flex-col gap-2`} htmlFor={`${id}-${field}`}>{t[field]}
                    <input id={`${id}-${field}`} className={`${formField} font-mono`} type="text" autoComplete="off" spellCheck={false}
                      maxLength={MAX_CHARACTERS_INPUT} disabled={draft.textKind !== "random"} value={draft.textKind === "random" ? draft[field] : ""}
                      aria-invalid={draft.textKind === "random" && refused.includes(field)}
                      aria-describedby={ids(`${id}-characters-hint`, draft.textKind === "random" && refusalId(field), pendingId(field))}
                      onChange={(event) => setDraft({ ...draft, [field]: event.target.value })} />
                  </label>
                    {pendingMark(field)}
                  </div>
                ))}
                <span id={`${id}-characters-hint`} className="text-sm font-normal text-brume sm:col-span-2">{draft.textKind === "random" ? t.charactersHint : t.charactersDisabled}</span>
                {charactersFirst && refusalAt(firstRefused)}
              </div>
            </fieldset>

            <fieldset className={group}>
              <legend className={legend}>{t.groupDuration}</legend>
              <div className="flex flex-col gap-2">
                <label className="flex min-h-11 items-center gap-3" htmlFor={`${id}-unlimited`}>
                  <input id={`${id}-unlimited`} type="checkbox" checked={draft.seconds === "none"} aria-describedby={ids(pendingId("seconds"))}
                    onChange={(event) => setDraft({ ...draft, seconds: event.target.checked ? "none" : String(TIME_LIMIT_MIN_MS / 1000) })} />
                  {t.unlimited}
                </label>
                <label className={`${fieldLabel} flex flex-col gap-2`} htmlFor={`${id}-seconds`}>{t.duration}
                  <input id={`${id}-seconds`} className={formField} type="number" min={TIME_LIMIT_MIN_MS / 1000}
                    max={TIME_LIMIT_MAX_MS / 1000} step="1" required={draft.seconds !== "none"} disabled={draft.seconds === "none"} value={draft.seconds === "none" ? "" : draft.seconds}
                    aria-invalid={secondsInvalid || undefined} aria-describedby={ids(`${id}-hint`, secondsInvalid && `${id}-seconds-error`, pendingId("seconds"))}
                    onChange={(event) => setDraft({ ...draft, seconds: event.target.value })} />
                </label>
                {secondsInvalid && <FieldError id={`${id}-seconds-error`} message={t.durationInvalid} />}
                {pendingMark("seconds")}
              </div>
            </fieldset>

            <fieldset className={group}>
              <legend className={legend}>{t.groupTyping}</legend>
              <div className="flex flex-col gap-2">
                <label className={fieldLabel} htmlFor={`${id}-mode`}>{t.mode}</label>
                <select id={`${id}-mode`} className={formField} value={draft.errorMode}
                  aria-describedby={ids(`${id}-mode-hint`, pendingId("errorMode"))}
                  onChange={(event) => {
                    const errorMode = event.target.value;
                    if (errorMode === "mandatory" || errorMode === "free") setDraft({ ...draft, errorMode });
                  }}>
                  <option value="mandatory">{t.mandatory}</option><option value="free">{t.free}</option>
                </select>
                <span id={`${id}-mode-hint`} className="text-sm font-normal text-brume">{t.modeHint}</span>
                {pendingMark("errorMode")}
              </div>
            </fieldset>

            <fieldset className={group}>
              <legend className={legend}>{t.groupGame}</legend>
              <div className="flex flex-col gap-2">
                <label className={fieldLabel} htmlFor={`${id}-game`}>{t.gameMode}</label>
                <select id={`${id}-game`} className={formField} value={draft.bonusesEnabled ? "arcade" : "training"} aria-describedby={ids(`${id}-game-hint`, pendingId("bonusesEnabled"))}
                  onChange={(event) => setDraft({ ...draft, bonusesEnabled: event.target.value === "arcade" })}>
                  <option value="training">{t.training}</option><option value="arcade">{t.arcade}</option>
                </select>
                <span id={`${id}-game-hint`} className="text-sm font-normal text-brume">{t.gameModeHint}</span>
                {pendingMark("bonusesEnabled")}
              </div>
            </fieldset>
          </fieldset>
          <p id={`${id}-hint`} className="text-sm text-brume">{t.hint}</p>
          {conflict && <p role="alert" className="text-sm text-or">⚠ {t.conflict}</p>}
          <div className="flex flex-wrap gap-3">
            <button ref={saveButton} type="submit" className={secondaryButton} disabled={!canEdit || conflict || uncertain || !validDraft(draft)}>{pending ? t.saving : t.save}</button>
            <button type="button" onClick={cancel} disabled={pending} className={discreetButton}>{t.cancel}</button>
          </div>
        </form>
      )}
      {/* A refusal that concerns no single field stays here; one about the draft's text is beside its field. */}
      {answer.error !== undefined && !fieldRefusal && <p role="alert" className="text-sm text-erreur">⚠ {t.errors[answer.error]}{answer.textProblem === undefined ? "" : ` ${t.textRefusals[answer.textProblem]}`}</p>}
      {answer.revision !== undefined && <p role="status" className="text-sm text-embrun">{awaiting ? t.waiting : t.saved}</p>}
      {(conflict || needsRefresh || awaiting || settings === undefined) && <button ref={reloadButton} type="button" disabled={pending} onClick={reload} className={`${discreetButton} self-start`}>{t.reload}</button>}
    </section>
  );
}
