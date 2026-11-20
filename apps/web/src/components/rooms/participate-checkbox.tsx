"use client";

import { useState } from "react";
import { useNarrowScreen } from "@/components/use-narrow-screen";

/**
 * "I race" choice of screen 05: checked by default only at 768 px and above (D-20). The hidden value before it makes an
 * unchecked box post `spectator`; the server keeps the last value of `role`.
 */
export function ParticipateCheckbox({ label }: { readonly label: string }) {
  const narrow = useNarrowScreen();
  const [choice, setChoice] = useState<boolean | undefined>(undefined);
  // A deliberate choice belongs to the user, even if the viewport changes afterwards.
  const checked = choice ?? !narrow;
  return (
    <label className="flex min-h-11 items-center gap-3 text-[15px] text-ecume">
      <input type="hidden" name="role" value="spectator" />
      <input type="checkbox" name="role" value="participant" checked={checked} onChange={(event) => setChoice(event.target.checked)} className="size-5 shrink-0 accent-action" />
      {label}
    </label>
  );
}
