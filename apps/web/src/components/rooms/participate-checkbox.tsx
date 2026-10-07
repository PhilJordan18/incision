/**
 * "I race" choice of screen 05: checked by default. The hidden value before it makes an
 * unchecked box post `spectator`; the server keeps the last value of `role`.
 */
export function ParticipateCheckbox({ label }: { readonly label: string }) {
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15px] text-ecume">
      <input type="hidden" name="role" value="spectator" />
      <input type="checkbox" name="role" value="participant" defaultChecked className="size-5 shrink-0 accent-action" />
      {label}
    </label>
  );
}
