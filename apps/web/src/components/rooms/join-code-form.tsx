"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { inlineLink, monoLabel, primaryButton, textFieldBase } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { CODE_INPUT_MAX_LENGTH } from "@/rooms/code-input";
import { joinRoomAction, type JoinFormState } from "@/server/rooms/actions";

/** Code field and its red action: the home page's join, and the "code not found" state. */
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
          maxLength={CODE_INPUT_MAX_LENGTH}
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
        <Link href={`/rooms/${state.currentCode}`} className={`${inlineLink} inline-flex min-h-11 items-center self-start text-sm`}>
          {format(t.goToRoom, { code: state.currentCode })}
        </Link>
      )}
    </form>
  );
}
