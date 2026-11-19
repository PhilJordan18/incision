"use client";

import Link from "next/link";
import { type ReactNode, useActionState, useEffect, useRef } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FieldError } from "@/components/ui/field-error";
import { inlineLink, monoLabel, secondaryButton, textFieldBase } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { CODE_INPUT_MAX_LENGTH } from "@/rooms/code-input";
import { joinRoomAction, type JoinFormState } from "@/server/rooms/actions";

type QuayJoinFormProps = {
  readonly t: Dictionary["home"];
  /** Tells this field from the first frame's one for assistive technology. */
  readonly codeContext: string;
  readonly joinLabel: string;
  readonly besideAction: ReactNode;
};

/**
 * The code field repeated on the departure quay. Same action and same answers as the first
 * frame's form, but its button is secondary (one red action per screen) and the field, the
 * button and the error carry their own id and name, so the two forms never answer for each other.
 *
 * Mirrors `components/rooms/join-code-form.tsx`, which belongs to another lot of the C1 work:
 * the two stay aligned by hand until that form takes an id prefix, a label and a button style.
 */
export function QuayJoinForm({ t, codeContext, joinLabel, besideAction }: QuayJoinFormProps) {
  const [state, formAction] = useActionState<JoinFormState, FormData>(joinRoomAction, {});
  const codeRef = useRef<HTMLInputElement>(null);
  // After a refused code, give the keyboard focus back to this field, not the first frame's.
  useEffect(() => {
    if (state.error !== undefined) {
      codeRef.current?.focus();
    }
  }, [state]);

  return (
    <form action={formAction} noValidate className="flex flex-col gap-2">
      <label htmlFor="quay-room-code" className={monoLabel}>
        {t.codeLabel}
        <span className="sr-only">{` — ${codeContext}`}</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={codeRef}
          id="quay-room-code"
          name="code"
          defaultValue={state.code}
          placeholder={t.codePlaceholder}
          maxLength={CODE_INPUT_MAX_LENGTH}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-invalid={state.error !== undefined}
          aria-describedby={state.error !== undefined ? "quay-room-code-error" : undefined}
          className={`${textFieldBase} h-14 w-48 font-mono text-xl tracking-[0.2em] uppercase`}
        />
        <SubmitButton label={joinLabel} pendingLabel={t.joining} className={`${secondaryButton} h-14!`} />
        {besideAction}
      </div>
      {state.error !== undefined && (
        <FieldError id="quay-room-code-error" message={format(t.codeErrors[state.error], { code: state.currentCode ?? "" })} />
      )}
      {state.error === "ALREADY_IN_ANOTHER_ROOM" && state.currentCode !== undefined && (
        <Link href={`/rooms/${state.currentCode}`} className={`${inlineLink} inline-flex min-h-11 items-center self-start text-sm`}>
          {format(t.goToRoom, { code: state.currentCode })}
        </Link>
      )}
    </form>
  );
}
