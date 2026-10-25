"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { fieldLabel, secondaryButton, textFieldBase } from "@/components/ui/styles";
import type { ProfilePhotoLabels } from "@/i18n/profile-photo";
import type { PhotoState } from "@/server/profile/photo-upload";

const initialState: PhotoState = { status: "idle" };

export function PhotoForm({ labels, uploadAction }: {
  readonly labels: ProfilePhotoLabels;
  readonly uploadAction: (previous: unknown, form: FormData) => Promise<PhotoState>;
}) {
  const [state, action, pending] = useActionState(uploadAction, initialState, "/account");
  const failed = state.status === "invalid" || state.status === "unavailable" || state.status === "busy";
  return (
    <form action={action} className="flex min-w-0 flex-col gap-3" aria-busy={pending}>
      <label htmlFor="profile-photo" className={fieldLabel}>{labels.label}</label>
      <input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required
        disabled={pending} className={`${textFieldBase} min-h-11 w-full min-w-0 py-2 file:mr-3 file:rounded-bouton file:border-0 file:bg-sillage file:px-3 file:py-2 file:text-ecume`}
        aria-invalid={state.status === "invalid"}
        aria-describedby={`profile-photo-help profile-photo-scope${failed ? " profile-photo-error" : ""}`} />
      <p id="profile-photo-help" className="text-sm text-brume">{labels.help}</p>
      <p id="profile-photo-scope" className="text-sm text-embrun">{labels.scope}</p>
      {failed && <p id="profile-photo-error" role="alert" className="text-erreur">
        <span aria-hidden="true">⚠ </span>{labels[state.status]}
      </p>}
      <p aria-live="polite" className="text-embrun">{state.status === "saved" ? labels.saved : ""}</p>
      <SubmitButton label={labels.save} pendingLabel={labels.saving} className={`${secondaryButton} self-start`} />
    </form>
  );
}
