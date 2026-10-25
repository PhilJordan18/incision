"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { fieldLabel, primaryButton, textField } from "@/components/ui/styles";
import type { ProfileNameLabels } from "@/i18n/profile-name";
import { updateDisplayNameAction } from "./display-name-action";

export function DisplayNameForm({ name, labels }: { readonly name: string; readonly labels: ProfileNameLabels }) {
  const [state, action, pending] = useActionState(updateDisplayNameAction, { status: "idle", value: name }, "/account");
  const failed = state.status === "invalid" || state.status === "unavailable";
  return (
    <form action={action} className="flex flex-col gap-3" aria-busy={pending}>
      <label htmlFor="display-name" className={fieldLabel}>{labels.label}</label>
      <input id="display-name" name="displayName" type="text" defaultValue={state.value}
        maxLength={1024} readOnly={pending} autoComplete="nickname" className={textField}
        aria-invalid={state.status === "invalid"}
        aria-describedby={`display-name-help display-name-scope${failed ? " display-name-error" : ""}`} />
      <p id="display-name-help" className="text-sm text-brume">{labels.help}</p>
      <p id="display-name-scope" className="text-sm text-embrun">{labels.scope}</p>
      {failed && <p id="display-name-error" role="alert" className="text-erreur">
        <span aria-hidden="true">⚠ </span>{state.status === "invalid" ? labels.invalid : labels.unavailable}
      </p>}
      <p role="status" className="text-embrun">{state.status === "saved" ? labels.saved : ""}</p>
      <SubmitButton label={labels.save} pendingLabel={labels.saving} className={`${primaryButton} self-start`} />
    </form>
  );
}
