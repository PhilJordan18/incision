import { BOT_LEVELS, type BotLevel } from "@incision/domain";
import { useState, type Ref } from "react";
import { roomBotsCopy } from "@/i18n/room-bots";
import { fieldLabel, secondaryButton, textField } from "@/components/ui/styles";
import { BotInsignia } from "./bot-insignia";

export function AddRoomBot({ t, enabled, submit, buttonRef }: {
  readonly t: ReturnType<typeof roomBotsCopy>; readonly enabled: boolean;
  readonly submit: (form: FormData) => void; readonly buttonRef: Ref<HTMLButtonElement>;
}) {
  const [level, setLevel] = useState<BotLevel>("beginner");
  return <div className="space-y-3 rounded-carte border border-houle p-4">
    <h3 className="text-lg font-semibold">{t.add}</h3>
    <p className="text-sm text-brume">{t.addHelp}</p>
    <div className="flex items-center gap-3"><BotInsignia level={level} /><p>{t.levels[level]}</p></div>
    <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="kind" value="add" />
      <label className={`${fieldLabel} min-w-0 max-w-full`}>{t.level}<select name="level" value={level} onChange={event => {
        const value = BOT_LEVELS.find(candidate => candidate === event.target.value);
        if (value) setLevel(value);
      }} disabled={!enabled} className={`${textField} block max-w-full`}>
        {BOT_LEVELS.map(value => <option key={value} value={value}>{t.levels[value]}</option>)}
      </select></label>
      <button ref={buttonRef} disabled={!enabled} className={secondaryButton}>{t.add}</button>
    </form>
  </div>;
}
