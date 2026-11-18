import { BOT_LEVELS, type BotLevel } from "@incision/domain";
import { useEffect, useId, useRef, useState } from "react";
import { format } from "@/i18n/format";
import { roomBotsCopy } from "@/i18n/room-bots";
import type { BotActionError } from "@/server/rooms/bot-actions";
import { discreetButton, fieldLabel, secondaryButton, textField } from "@/components/ui/styles";
import { BotInsignia } from "./bot-insignia";

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
  /** The panel's last request was this line's: only then is a new saved level this line's own save. */
  readonly requested: boolean;
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
export function RoomBotRow({ bot, index, t, host, enabled, submit, error, reload, requested, saving }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ saved: bot.level, level: bot.level });
  // A confirmed remote level replaces a stale draft without remounting the focused control.
  if (draft.saved !== bot.level) {
    // The level this line asked for is now the saved one: its edit is over. The same level saved
    // from elsewhere (another tab) leaves the line open, as any other room update does.
    if (open && requested && draft.level === bot.level && draft.saved !== draft.level) setOpen(false);
    setDraft({ saved: bot.level, level: bot.level });
  }
  const level = draft.saved === bot.level ? draft.level : bot.level;
  const id = useId();
  const toggle = useRef<HTMLButtonElement>(null);
  const select = useRef<HTMLSelectElement>(null);
  const line = useRef<HTMLLIElement>(null);
  const wasOpen = useRef(false);
  const dirty = level !== bot.level;
  const name = `${t.label} ${index + 1}`;

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
    className={`grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-3 gap-y-2 py-2 pr-4 sm:grid-cols-[3rem_minmax(4.5rem,auto)_minmax(0,1fr)_auto_auto] ${open
      ? `border-l-[3px] bg-nuit pl-[13px] ${dirty ? "border-l-or forced-colors:border-l-8 forced-colors:border-double forced-colors:pl-2" : "border-l-voile"}`
      : "pl-4"}`}>
    <span className="row-span-2 self-start sm:row-span-1 sm:self-center"><BotInsignia level={bot.level} /></span>
    <p className="col-span-2 font-semibold sm:col-span-1 sm:whitespace-nowrap">
      {name}
      {dirty && <span className="ml-2 inline-flex items-center gap-1.5 rounded-puce border border-or px-1.5 py-0.5 align-middle font-mono text-[10px] font-normal tracking-[0.14em] whitespace-nowrap text-ecume uppercase">
        <span aria-hidden="true">⚠</span><span>{t.unsavedTag}</span>
      </span>}
    </p>
    <p className="col-span-2 min-w-0 text-sm text-embrun sm:col-span-1">{t.savedLevel} {t.levels[bot.level]}</p>
    {host && <>
      {/* Not disabled while open: discarding a draft needs no server, and the button holds the focus. */}
      <button ref={toggle} type="button" className={`${lineButton} col-span-2 sm:col-span-1`} aria-expanded={open} aria-controls={open ? `${id}-editor` : undefined}
        disabled={(!open && !enabled) || (open && saving)} aria-label={format(open ? t.cancelBot : t.editBot, { bot: name })} onClick={toggleEditor}>{open ? t.cancel : t.edit}</button>
      <button type="button" disabled={!enabled} className={lineButton} aria-label={`${t.remove} ${name}`} onClick={() => {
        const form = new FormData(); form.set("kind", "remove"); form.set("botId", bot.botId); submit(form);
      }}>{t.remove}</button>
      {open && <>
        <form id={`${id}-editor`} onSubmit={(event) => { event.preventDefault(); if (dirty) submit(new FormData(event.currentTarget)); }}
          className="col-span-full flex min-w-0 flex-wrap items-end gap-x-3 gap-y-2.5 sm:col-start-2 sm:flex-nowrap">
          <input type="hidden" name="kind" value="level" /><input type="hidden" name="botId" value={bot.botId} />
          <label className={`${fieldLabel} flex min-w-0 flex-[1_1_12rem] flex-col gap-2`}>{t.level} {index + 1}<select ref={select} name="level" value={level} aria-describedby={`${id}-draft`} onChange={event => {
            const value = BOT_LEVELS.find(candidate => candidate === event.target.value);
            if (value) setDraft({ saved: bot.level, level: value });
          }} disabled={!enabled} className={`${textField} block max-w-full`}>
            {BOT_LEVELS.map(value => <option key={value} value={value}>{t.levels[value]}</option>)}
          </select></label>
          <button disabled={!enabled} aria-disabled={!dirty || !enabled} className={`${dirty ? secondaryButton : discreetButton} flex-[1_1_8rem] px-4! sm:flex-none sm:shrink-0`}>{t.save}</button>
        </form>
        <p id={`${id}-draft`} role="status" className="col-span-full text-sm text-embrun sm:col-start-2">
          {dirty ? <><span aria-hidden="true" className="text-or">⚠ </span>{t.unsaved} {t.levels[level]}. {t.saveHint}</> : t.noChanges}
        </p>
      </>}
      {error !== undefined && <div className="col-span-full flex flex-col items-start gap-2 border-l-[3px] border-erreur pl-2.5 sm:col-start-2">
        <p role="alert" className="text-sm text-erreur"><span aria-hidden="true">⚠ </span>{t.errors[error]}</p>
        <button type="button" className={lineButton} onClick={reload}>{t.reload}</button>
      </div>}
    </>}
  </li>;
}
