import { BOT_LEVELS, type BotLevel } from "@incision/domain";
import { useState, type Ref } from "react";
import { roomBotsCopy } from "@/i18n/room-bots";
import { fieldLabel, secondaryButton, textField } from "@/components/ui/styles";
import { BotInsignia } from "./bot-insignia";

/** A free berth (DA2-5a): compact and dashed, so that it never reads as a line of the list under it. */
export function AddRoomBot({ t, enabled, submit, buttonRef }: {
  readonly t: ReturnType<typeof roomBotsCopy>; readonly enabled: boolean;
  readonly submit: (form: FormData) => void; readonly buttonRef: Ref<HTMLButtonElement>;
}) {
  const [level, setLevel] = useState<BotLevel>("beginner");
  return <div className="flex flex-col gap-2.5 rounded-carte border-2 border-dashed border-voile px-4 py-3.5">
    <h3 className="flex items-center gap-2.5 font-semibold">
      <span aria-hidden="true" className="grid size-[26px] shrink-0 place-items-center rounded-full border-[1.5px] border-ecume font-mono text-sm leading-none">+</span>
      {t.add}
    </h3>
    <form onSubmit={(event) => { event.preventDefault(); submit(new FormData(event.currentTarget)); }}
      className="grid grid-cols-[auto_minmax(0,1fr)] items-end gap-x-3.5 gap-y-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
      <input type="hidden" name="kind" value="add" />
      <BotInsignia level={level} />
      <label className={`${fieldLabel} flex min-w-0 flex-col gap-2`}>{t.level}<select name="level" value={level} onChange={event => {
        const value = BOT_LEVELS.find(candidate => candidate === event.target.value);
        if (value) setLevel(value);
      }} disabled={!enabled} className={`${textField} block max-w-full`}>
        {BOT_LEVELS.map(value => <option key={value} value={value}>{t.levels[value]}</option>)}
      </select></label>
      <button ref={buttonRef} disabled={!enabled} className={`${secondaryButton} col-span-full sm:col-span-1`}>{t.add}</button>
    </form>
    <p className="text-sm text-brume">{t.addHelp}</p>
  </div>;
}
