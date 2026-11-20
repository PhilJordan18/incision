import { BOT_LEVELS, type BotLevel } from "@incision/domain";
import { useEffect, useId, useRef, useState } from "react";
import { format } from "@/i18n/format";
import { roomBotsCopy } from "@/i18n/room-bots";
import type { BotActionError } from "@/server/rooms/bot-actions";
import { discreetButton, fieldLabel, secondaryButton, textField } from "@/components/ui/styles";
import { BotInsignia } from "./bot-insignia";
import { UnsavedTag } from "./unsaved-tag";

type Props = {
  readonly bot: { readonly botId: string; readonly level: BotLevel };
  readonly index: number;
  readonly t: ReturnType<typeof roomBotsCopy>;
  readonly host: boolean;
  /** The room accepts a change now: live, waiting, nothing pending and no refusal to read first. */
  readonly enabled: boolean;
  readonly submit: (form: FormData) => void;
  /** The server's refusal of this line's last request; the panel keeps the others. */
  readonly error?: BotActionError;
  readonly reload: () => void;
  /**
   * The room revision at which this line's own level save was confirmed (ack and snapshot both in),
   * or undefined. Each confirmation closes the line once; a level saved from elsewhere never does.
   */
  readonly confirmed: number | undefined;
  /** That request is on its way or awaited in the room: the line cannot be cancelled under it. */
  readonly saving: boolean;
};

/** The two actions of a line: 44 px targets, narrower than the page's buttons. */
const lineButton = `${discreetButton} h-11! px-4!`;

/**
 * One line per bot (DA2-5b). The level is edited on demand: « Modifier » opens the select,
 * « Changer le niveau » is the only way to save, « Annuler » discards. The open state lives beside
 * the draft: an open line never closes by itself, whatever the room broadcasts or the other lines
 * do; only its own confirmed save or « Annuler » closes it.
 */
export function RoomBotRow({ bot, index, t, host, enabled, submit, error, reload, confirmed, saving }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ saved: bot.level, level: bot.level });
  // A confirmed remote level replaces a stale draft without remounting the focused control.
  if (draft.saved !== bot.level) setDraft({ saved: bot.level, level: bot.level });
  // This line's own save is confirmed: its edit is over, once per confirmation. Reopened later, the
  // line is no longer tied to that save, so a level saved from elsewhere (another tab), even the
  // one drafted here, leaves it open as any other room update does.
  const [closedFor, setClosedFor] = useState<number>();
  if (confirmed !== undefined && confirmed !== closedFor) {
    setClosedFor(confirmed);
    if (open) setOpen(false);
  }
  const level = draft.saved === bot.level ? draft.level : bot.level;
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const line = useRef<HTMLLIElement>(null);
  const wasOpen = useRef(false);
  const dirty = level !== bot.level;
  const name = `${t.label} ${index + 1}`;

  const reloadButton = useRef<HTMLButtonElement>(null);
  const afterReload = useRef(false);
  // A refusal disables the control that had the focus: the way out of it, on this line, takes it,
  // unless the host has moved on to something else while the request was on its way.
  // After « Recharger la salle » (which goes away), the focus comes back to the line itself.
  useEffect(() => {
    const active = document.activeElement;
    const ours = active === null || active === document.body || line.current?.contains(active) === true;
    if (error !== undefined) {
      if (ours) reloadButton.current?.focus();
    } else if (afterReload.current && enabled) {
      afterReload.current = false;
      if (ours) (open ? select.current : toggle.current)?.focus();
    }
  }, [error, enabled, open]);

  const giveFocusBack = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      select.current?.focus();
    } else if (!open && wasOpen.current) {
      giveFocusBack.current = true;
    }
    wasOpen.current = open;
    // The editor is gone: a focus left inside the line (or nowhere) goes back to « Modifier », once
    // the button can take it (after a save it stays disabled until the room confirms).
    if (!open && giveFocusBack.current && toggle.current?.disabled === false) {
      giveFocusBack.current = false;
      const active = document.activeElement;
      if (active === null || active === document.body || line.current?.contains(active) === true) toggle.current.focus();
    }
  }, [open, enabled]);

  function toggleEditor() {
    if (open) {
      setDraft({ saved: bot.level, level: bot.level });
      setOpen(false);
    } else if (enabled) {
      setOpen(true);
    }
  }

  return <li ref={line} data-open={open || undefined} data-unsaved={dirty || undefined}
    className={`grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-2 pr-4 sm:max-lg:grid-cols-[3rem_minmax(4.5rem,auto)_minmax(0,1fr)_auto_auto] xl:grid-cols-[3rem_minmax(4.5rem,auto)_minmax(0,1fr)_auto_auto] ${open
      ? `border-l-[3px] bg-nuit pl-[13px] ${dirty ? "border-l-or forced-colors:border-l-8 forced-colors:border-double forced-colors:pl-2" : "border-l-voile"}`
      : "pl-4"}`}>
    <span className="row-span-2 self-start sm:max-lg:row-span-1 sm:max-lg:self-center xl:row-span-1 xl:self-center"><BotInsignia level={bot.level} /></span>
    <p className="col-span-2 font-semibold sm:max-lg:col-span-1 sm:max-lg:whitespace-nowrap xl:col-span-1 xl:whitespace-nowrap">
      {name}
      {dirty && <UnsavedTag label={t.unsavedTag} className="ml-2 align-middle" />}
    </p>
    <p className="col-span-2 min-w-0 text-sm text-embrun sm:max-lg:col-span-1 xl:col-span-1">{t.savedLevel} {t.levels[bot.level]}</p>
    {host && <>
      {/* Not disabled while open: discarding a draft needs no server, and the button holds the focus. */}
      <button ref={toggle} type="button" className={`${lineButton} col-span-2 sm:max-lg:col-span-1 xl:col-span-1`} aria-expanded={open} aria-controls={open ? `${id}-editor` : undefined}
        disabled={(!open && !enabled) || (open && saving)} aria-label={format(open ? t.cancelBot : t.editBot, { bot: name })} onClick={toggleEditor}>{open ? t.cancel : t.edit}</button>
      <button type="button" disabled={!enabled} className={lineButton} aria-label={`${t.remove} ${name}`} onClick={() => {
        const form = new FormData(); form.set("kind", "remove"); form.set("botId", bot.botId); submit(form);
      }}>{t.remove}</button>
      {open && <>
        <form id={`${id}-editor`} onSubmit={(event) => { event.preventDefault(); if (dirty) submit(new FormData(event.currentTarget)); }}
          className="col-span-full flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2.5 sm:max-lg:col-start-2 sm:max-lg:flex-nowrap xl:col-start-2 xl:flex-nowrap">
          <input type="hidden" name="kind" value="level" /><input type="hidden" name="botId" value={bot.botId} />
          <label className={`${fieldLabel} flex min-w-0 flex-[1_1_12rem] flex-col gap-2 lg:max-xl:basis-full`}>{t.level} {index + 1}<select ref={select} name="level" value={level} aria-describedby={`${id}-draft`} onChange={event => {
            const value = BOT_LEVELS.find(candidate => candidate === event.target.value);
            if (value) setDraft({ saved: bot.level, level: value });
          }} disabled={!enabled} className={`${textField} block max-w-full`}>
            {BOT_LEVELS.map(value => <option key={value} value={value}>{t.levels[value]}</option>)}
          </select></label>
          <button disabled={!enabled} aria-disabled={!dirty || !enabled} className={`${dirty ? secondaryButton : discreetButton} flex-[1_1_8rem] px-4! sm:max-lg:flex-none sm:max-lg:shrink-0 xl:flex-none xl:shrink-0`}>{t.save}</button>
        </form>
        <p id={`${id}-draft`} role="status" className="col-span-full text-sm text-embrun sm:max-lg:col-start-2 xl:col-start-2">
          {dirty ? <><span aria-hidden="true" className="text-or">⚠ </span>{t.unsaved} {t.levels[level]}. {t.saveHint}</> : t.noChanges}
        </p>
      </>}
      {error !== undefined && <div className="col-span-full flex flex-col items-start gap-2 border-l-[3px] border-erreur pl-2.5 sm:max-lg:col-start-2 xl:col-start-2">
        <p role="alert" className="text-sm text-erreur"><span aria-hidden="true">⚠ </span>{t.errors[error]}</p>
        <button ref={reloadButton} type="button" className={lineButton} onClick={() => { afterReload.current = true; reload(); }}>{t.reload}</button>
      </div>}
    </>}
  </li>;
}
