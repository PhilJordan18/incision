type SegmentedChoiceProps<Value extends string> = {
  readonly name: string;
  readonly legend: string;
  readonly options: readonly { readonly value: Value; readonly label: string }[];
  readonly defaultValue: Value;
};

/**
 * Segmented selector of the design (README §3): native radio buttons in a fieldset, so
 * arrow keys, labels and form submission work without JavaScript.
 */
export function SegmentedChoice<Value extends string>({ name, legend, options, defaultValue }: SegmentedChoiceProps<Value>) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 font-mono text-[11px] font-medium tracking-[0.2em] text-brume uppercase">{legend}</legend>
      <div className="inline-grid auto-cols-fr grid-flow-col gap-1 self-start rounded-[10px] border border-houle bg-nuit p-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex min-h-11 cursor-pointer items-center justify-center rounded-[7px] px-5 text-[15px] font-medium text-embrun has-checked:bg-ecume has-checked:font-semibold has-checked:text-abysse has-focus-visible:outline-3 has-focus-visible:outline-moi"
          >
            <input type="radio" name={name} value={option.value} defaultChecked={option.value === defaultValue} className="sr-only" />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
