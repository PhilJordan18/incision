"use client";

import { ROOM_CODE_LENGTH } from "@incision/domain";
import { useActionState, useEffect, useRef } from "react";
import { FieldError } from "@/components/ui/field-error";
import { monoLabel, primaryButton, textFieldBase } from "@/components/ui/styles";
import { SubmitButton } from "@/components/submit-button";
import type { Dictionary } from "@/i18n/dictionaries";
import { joinRoomByCode, type JoinFormState } from "./actions";

/** Code field and the only red action of the home page (one acting red per screen). */
export function JoinForm({ t }: { readonly t: Dictionary["home"] }) {
  const [state, formAction] = useActionState<JoinFormState, FormData>(joinRoomByCode, {});
  const codeRef = useRef<HTMLInputElement>(null);
  // After a refused code, give the keyboard focus back to the field.
  useEffect(() => {
    if (state.error !== undefined) {
      codeRef.current?.focus();
    }
  }, [state]);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <label htmlFor="room-code" className={monoLabel}>
        {t.codeLabel}
      </label>
      <div className="flex flex-wrap gap-3">
        <input
          ref={codeRef}
          id="room-code"
          name="code"
          defaultValue={state.code}
          placeholder={t.codePlaceholder}
          maxLength={ROOM_CODE_LENGTH + 2}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={state.error !== undefined}
          aria-describedby={state.error !== undefined ? "room-code-error" : undefined}
          className={`${textFieldBase} h-14 w-48 font-mono text-xl tracking-[0.2em] uppercase`}
        />
        <SubmitButton label={t.join} pendingLabel={t.joining} className={primaryButton} />
      </div>
      {state.error !== undefined && <FieldError id="room-code-error" message={t.codeErrors[state.error]} />}
    </form>
  );
}
