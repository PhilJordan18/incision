import { ROOM_VISIBILITIES, type RoomVisibility } from "@incision/domain";
import { roomVisibilityCopy } from "@/i18n/room-visibility";
import type { Locale } from "@/i18n/locale";
import { monoLabel } from "@/components/ui/styles";

type Props = { readonly locale: Locale; readonly name: string; readonly disabled?: boolean; readonly describedBy?: string }
  & ({ readonly defaultValue: RoomVisibility; readonly value?: never; readonly onChange?: never }
    | { readonly value: RoomVisibility; readonly onChange: (value: RoomVisibility) => void; readonly defaultValue?: never });

/** Screen 05's "01 · Accès" radio cards, with SALLE-03's three visibilities (works without JavaScript). */
export function VisibilityChoices(props: Props) {
  const t = roomVisibilityCopy(props.locale);
  return <fieldset className="flex flex-col gap-3" aria-describedby={props.describedBy} disabled={props.disabled}>
    <legend className={`${monoLabel} mb-3`}>{t.legend}</legend>
    <div className="grid gap-3 md:grid-cols-3">
      {ROOM_VISIBILITIES.map((visibility) => <label key={visibility}
        className="flex min-h-11 cursor-pointer flex-col gap-1 rounded-lg border border-houle p-4 has-[:checked]:border-2 has-[:checked]:border-ecume has-[:checked]:bg-sillage has-[:disabled]:cursor-not-allowed">
        <span className="flex items-center gap-2.5 font-semibold text-ecume">
          <input type="radio" name={props.name} value={visibility} className="size-[18px] accent-moi"
            {...(props.value === undefined
              ? { defaultChecked: props.defaultValue === visibility }
              : { checked: props.value === visibility, onChange: () => props.onChange(visibility) })} />
          {t.choices[visibility].label}
        </span>
        <span className="text-sm text-embrun">{t.choices[visibility].body}</span>
      </label>)}
    </div>
  </fieldset>;
}
