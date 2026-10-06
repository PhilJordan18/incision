"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { PageHeading } from "@/components/ui/page-heading";
import { SegmentedChoice } from "@/components/ui/segmented-choice";
import { card, primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { joinRoomAction, type JoinFormState } from "@/server/rooms/actions";

/** Join panel of a room's page, for a signed-in account that is not a member yet. */
export function JoinRoomForm({ code, t }: { readonly code: string; readonly t: Dictionary }) {
  const [state, formAction] = useActionState<JoinFormState, FormData>(joinRoomAction, {});
  return (
    <>
      <PageHeading bold={t.rooms.joinHeadingBold} serif={code} />
      <section className={`${card} flex max-w-xl flex-col gap-5`}>
        <p className="text-embrun">{format(t.rooms.joinIntro, { code })}</p>
        <form action={formAction} className="flex flex-col gap-6">
          {state.error !== undefined && (
            <p role="alert" className="flex gap-2 rounded-bouton border border-erreur bg-erreur-fond px-4 py-3 text-erreur">
              <span aria-hidden="true">⚠</span>
              {format(t.home.codeErrors[state.error], { code: state.currentCode ?? "" })}
            </p>
          )}
          <input type="hidden" name="code" value={code} />
          <SegmentedChoice
            name="role"
            legend={t.rooms.joinRole}
            defaultValue="participant"
            options={[
              { value: "participant", label: t.rooms.roles.participant },
              { value: "spectator", label: t.rooms.roles.spectator },
            ]}
          />
          <SubmitButton label={t.home.join} pendingLabel={t.home.joining} className={`${primaryButton} self-start`} />
        </form>
      </section>
    </>
  );
}
