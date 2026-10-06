"use client";

import Link from "next/link";
import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { SegmentedChoice } from "@/components/ui/segmented-choice";
import { primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { createRoomAction, type CreateRoomState } from "@/server/rooms/actions";

export function CreateRoomForm({ t }: { readonly t: Dictionary["rooms"] }) {
  const [state, formAction] = useActionState<CreateRoomState, FormData>(createRoomAction, {});
  return (
    <form action={formAction} className="flex flex-col gap-6">
      {state.error !== undefined && (
        <div role="alert" className="flex flex-col gap-2 rounded-bouton border border-erreur bg-erreur-fond px-4 py-3 text-erreur">
          <p className="flex gap-2">
            <span aria-hidden="true">⚠</span>
            {state.error === "ALREADY_IN_ROOM"
              ? format(t.alreadyInRoom, { code: state.currentCode ?? "" })
              : t.createErrors.UNAVAILABLE}
          </p>
          {state.currentCode !== undefined && (
            <Link href={`/rooms/${state.currentCode}`} className="text-ecume underline underline-offset-4">
              {t.goToMyRoom}
            </Link>
          )}
        </div>
      )}
      <SegmentedChoice
        name="role"
        legend={t.roleLegend}
        defaultValue="participant"
        options={[
          { value: "participant", label: t.roles.participant },
          { value: "spectator", label: t.roles.spectator },
        ]}
      />
      <p className="text-sm text-brume">{t.visibilityNote}</p>
      <SubmitButton label={t.create} pendingLabel={t.creating} className={`${primaryButton} self-start`} />
    </form>
  );
}
