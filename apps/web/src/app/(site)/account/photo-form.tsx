"use client";

import { useState, type SubmitEvent } from "react";
import { useRouter } from "next/navigation";
import { MAX_PHOTO_BYTES, photoStatus, type PhotoStatus } from "@/profile/photo-contract";
import { fieldLabel, secondaryButton, textFieldBase } from "@/components/ui/styles";
import type { ProfilePhotoLabels } from "@/i18n/profile-photo";

export function PhotoForm({ labels, initialStatus = "idle" }: {
  readonly labels: ProfilePhotoLabels;
  readonly initialStatus?: PhotoStatus;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function submit(event: SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const file = form.get("photo");
    if (!(file instanceof File) || file.size > MAX_PHOTO_BYTES) { setStatus("invalid"); return; }
    setPending(true);
    try {
      const response = await fetch("/api/account/photo", { method: "POST", body: form, headers: { Accept: "application/json" } });
      const result: unknown = response.ok ? await response.json() : null;
      const next = result !== null && typeof result === "object" && "status" in result ? photoStatus(result.status) : "unavailable";
      setStatus(next === "idle" ? "unavailable" : next);
      if (next === "saved") router.refresh();
    } catch { setStatus("unavailable"); }
    finally { setPending(false); }
  }
  const failed = status === "invalid" || status === "unavailable" || status === "busy";
  return (
    <form action="/api/account/photo" method="post" encType="multipart/form-data" onSubmit={submit} className="flex min-w-0 flex-col gap-3" aria-busy={pending}>
      <label htmlFor="profile-photo" className={fieldLabel}>{labels.label}</label>
      <input id="profile-photo" name="photo" type="file" accept="image/jpeg,image/png,image/webp" required
        onChange={(event) => setStatus((event.currentTarget.files?.[0]?.size ?? 0) > MAX_PHOTO_BYTES ? "invalid" : "idle")}
        disabled={pending} className={`${textFieldBase} min-h-11 w-full min-w-0 py-2 file:mr-3 file:rounded-bouton file:border-0 file:bg-sillage file:px-3 file:py-2 file:text-ecume`}
        aria-invalid={status === "invalid"}
        aria-describedby={`profile-photo-help profile-photo-scope${failed ? " profile-photo-error" : ""}`} />
      <p id="profile-photo-help" className="text-sm text-brume">{labels.help}</p>
      <p id="profile-photo-scope" className="text-sm text-embrun">{labels.scope}</p>
      {failed && <p id="profile-photo-error" role="alert" className="text-erreur">
        <span aria-hidden="true">⚠ </span>{labels[status]}
      </p>}
      <p aria-live="polite" className="text-embrun">{status === "saved" ? labels.saved : ""}</p>
      <button type="submit" aria-disabled={pending} className={`${secondaryButton} self-start`}>{pending ? labels.saving : labels.save}</button>
    </form>
  );
}
