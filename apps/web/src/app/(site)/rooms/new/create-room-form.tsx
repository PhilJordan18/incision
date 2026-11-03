"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { DEFAULT_CREATED_ROOM_VISIBILITY, ROOM_MIN_CAPACITY, ROOM_MAX_CAPACITY } from "@incision/domain";
import { ParticipateCheckbox } from "@/components/rooms/participate-checkbox";
import { VisibilityChoices } from "@/components/rooms/visibility-choices";
import { roomVisibilityCopy } from "@/i18n/room-visibility";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { inlineLink, primaryButton, fieldLabel, textField } from "@/components/ui/styles";
import type { Locale } from "@/i18n/locale";
import { roomAccessCopy } from "@/i18n/room-access";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { createRoomAction, type CreateRoomState } from "@/server/rooms/actions";

export function CreateRoomForm({ t, locale }: { readonly t: Dictionary["rooms"]; readonly locale: Locale }) {
  const [state, formAction] = useActionState<CreateRoomState, FormData>(createRoomAction, {});
  const [capacity, setCapacity] = useState(String(ROOM_MAX_CAPACITY));
  const id = useId();
  const access = roomAccessCopy(locale);
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error !== undefined && (
        <div className="flex flex-col gap-2">
          <FormAlert
            message={creationError(state, t, locale)}
          />
          {state.currentCode !== undefined && (
            <Link href={`/rooms/${state.currentCode}`} className={`${inlineLink} inline-flex min-h-11 items-center self-start text-sm`}>
              {t.goToMyRoom}
            </Link>
          )}
        </div>
      )}
      <VisibilityChoices locale={locale} name="visibility" defaultValue={DEFAULT_CREATED_ROOM_VISIBILITY} />
      <ParticipateCheckbox label={t.participate} />
      <div className="flex flex-col gap-2">
        <label className={fieldLabel} htmlFor={id}>{access.capacity}</label>
        <input id={id} name="capacity" type="number" required min={ROOM_MIN_CAPACITY} max={ROOM_MAX_CAPACITY} step="1"
          className={textField} value={capacity} onChange={(event) => setCapacity(event.target.value)}
          aria-invalid={state.error === "INVALID_CAPACITY" || undefined} aria-describedby={`${id}-hint`} />
        <p id={`${id}-hint`} className="text-sm text-brume">{access.hint}</p>
      </div>
      <SubmitButton label={t.create} pendingLabel={t.creating} className={`${primaryButton} self-start`} />
    </form>
  );
}

function creationError(state: CreateRoomState, t: Dictionary["rooms"], locale: Locale): string {
  switch (state.error) {
    case undefined: return "";
    case "ALREADY_IN_ROOM": return format(t.alreadyInRoom, { code: state.currentCode ?? "" });
    case "INVALID_CAPACITY": return roomAccessCopy(locale).errors.INVALID_CAPACITY;
    case "INVALID_VISIBILITY": return roomVisibilityCopy(locale).errors.INVALID_VISIBILITY;
    default: return t.changeErrors[state.error];
  }
}
