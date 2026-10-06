"use client";

import { ROOM_CODE_LENGTH } from "@incision/domain";
import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { inlineLink, monoLabel, primaryButton, textFieldBase } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { joinRoomAction, type JoinFormState } from "@/server/rooms/actions";

/** Code field and the only red action of the home page (one acting red per screen). */
export function JoinForm({ t }: { readonly t: Dictionary["home"] }) {
  const [state, formAction] = useActionState<JoinFormState, FormData>(joinRoomAction, {});
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
      {state.error !== undefined && (
        <FieldError id="room-code-error" message={format(t.codeErrors[state.error], { code: state.currentCode ?? "" })} />
      )}
      {state.error === "ALREADY_IN_ANOTHER_ROOM" && state.currentCode !== undefined && (
        <Link href={`/rooms/${state.currentCode}`} className={`${inlineLink} text-sm`}>
          {format(t.goToRoom, { code: state.currentCode })}
        </Link>
      )}
    </form>
  );
}
