"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ParticipateCheckbox } from "@/components/rooms/participate-checkbox";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { inlineLink, primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { createRoomAction, type CreateRoomState } from "@/server/rooms/actions";

export function CreateRoomForm({ t }: { readonly t: Dictionary["rooms"] }) {
  const [state, formAction] = useActionState<CreateRoomState, FormData>(createRoomAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error !== undefined && (
        <div className="flex flex-col gap-2">
          <FormAlert
            message={state.error === "ALREADY_IN_ROOM" ? format(t.alreadyInRoom, { code: state.currentCode ?? "" }) : t.changeErrors[state.error]}
          />
          {state.currentCode !== undefined && (
            <Link href={`/rooms/${state.currentCode}`} className={`${inlineLink} inline-flex min-h-11 items-center self-start text-sm`}>
              {t.goToMyRoom}
            </Link>
          )}
        </div>
      )}
      <ParticipateCheckbox label={t.participate} />
      <p className="text-sm text-brume">{t.visibilityNote}</p>
      <SubmitButton label={t.create} pendingLabel={t.creating} className={`${primaryButton} self-start`} />
    </form>
  );
}
