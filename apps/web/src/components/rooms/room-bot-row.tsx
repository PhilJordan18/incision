import { BOT_LEVELS, type BotLevel } from "@incision/domain";
import { useId, useState } from "react";
import { roomBotsCopy } from "@/i18n/room-bots";
import { discreetButton, fieldLabel, textField } from "@/components/ui/styles";
import { BotInsignia } from "./bot-insignia";

export function RoomBotRow({ bot, index, t, host, enabled, submit }: {
  readonly bot: { readonly botId: string; readonly level: BotLevel }; readonly index: number;
  readonly t: ReturnType<typeof roomBotsCopy>; readonly host: boolean; readonly enabled: boolean;
  readonly submit: (form: FormData) => void;
}) {
  const [draft, setDraft] = useState({ saved: bot.level, level: bot.level });
  // A confirmed remote level replaces a stale draft without remounting the focused control.
  if (draft.saved !== bot.level) setDraft({ saved: bot.level, level: bot.level });
  const level = draft.saved === bot.level ? draft.level : bot.level;
  const id = useId();
  const dirty = level !== bot.level;
  return <li className="space-y-3 rounded-carte border border-houle p-4">
    <div className="flex items-center gap-3"><BotInsignia level={bot.level} />
      <div><p className="font-semibold">{t.label} {index + 1}</p><p className="text-sm text-embrun">{t.savedLevel} {t.levels[bot.level]}</p></div>
    </div>
    {host && <>
      <div className="flex flex-wrap items-end gap-2">
        <form onSubmit={(event) => { event.preventDefault(); if (dirty) submit(new FormData(event.currentTarget)); }} className="flex min-w-0 max-w-full flex-wrap items-end gap-2">
          <input type="hidden" name="kind" value="level" /><input type="hidden" name="botId" value={bot.botId} />
          <label className={`${fieldLabel} min-w-0 max-w-full`}>{t.level} {index + 1}<select name="level" value={level} aria-describedby={`${id}-draft`} onChange={event => {
            const value = BOT_LEVELS.find(candidate => candidate === event.target.value);
            if (value) setDraft({ saved: bot.level, level: value });
          }} disabled={!enabled} className={`${textField} block max-w-full`}>
            {BOT_LEVELS.map(value => <option key={value} value={value}>{t.levels[value]}</option>)}
          </select></label>
          <button disabled={!enabled} aria-disabled={!dirty || !enabled} className={discreetButton}>{t.save}</button>
        </form>
        <button type="button" disabled={!enabled} className={discreetButton} aria-label={`${t.remove} ${t.label} ${index + 1}`} onClick={() => {
          const form = new FormData(); form.set("kind", "remove"); form.set("botId", bot.botId); submit(form);
        }}>{t.remove}</button>
      </div>
      <p id={`${id}-draft`} role="status" className="text-sm text-embrun">{dirty ? `${t.unsaved} ${t.levels[level]}. ${t.saveHint}` : t.noChanges}</p>
    </>}
  </li>;
}
