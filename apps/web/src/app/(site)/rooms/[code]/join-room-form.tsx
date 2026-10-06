"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { ParticipateCheckbox } from "@/components/rooms/participate-checkbox";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { PageHeading } from "@/components/ui/page-heading";
import { card, inlineLink, monoLabel, primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { joinRoomAction, type JoinFormState } from "@/server/rooms/actions";
import { RoomCode } from "./room-code";

/** Join panel of a room's page, for a signed-in account that is not a member yet. */
export function JoinRoomForm({ code, t }: { readonly code: string; readonly t: Dictionary }) {
  const [state, formAction] = useActionState<JoinFormState, FormData>(joinRoomAction, {});
  const router = useRouter();
  // The room closed (or a race started) since this page was drawn: show its state instead.
  useEffect(() => {
    if (state.error === "ROOM_NOT_ADMITTING") {
      router.refresh();
    }
  }, [state, router]);
  return (
    <>
      <PageHeading bold={t.rooms.joinHeadingBold} serif={t.rooms.joinHeadingSerif} />
      <section className={`${card} flex max-w-xl flex-col gap-5`}>
        <div className="flex flex-col gap-2">
          <p className={monoLabel}>{t.rooms.codeLabel}</p>
          <RoomCode code={code} />
        </div>
        <p className="text-embrun">{format(t.rooms.joinIntro, { code })}</p>
        <form action={formAction} className="flex flex-col gap-6">
          {state.error !== undefined && (
            <div className="flex flex-col gap-2">
              <FormAlert message={format(t.home.codeErrors[state.error], { code: state.currentCode ?? "" })} />
              {state.error === "ALREADY_IN_ANOTHER_ROOM" && state.currentCode !== undefined && (
                <Link href={`/rooms/${state.currentCode}`} className={`${inlineLink} inline-flex min-h-11 items-center self-start text-sm`}>
                  {format(t.home.goToRoom, { code: state.currentCode })}
                </Link>
              )}
            </div>
          )}
          <input type="hidden" name="code" value={code} />
          <ParticipateCheckbox label={t.rooms.participate} />
          <SubmitButton label={t.home.join} pendingLabel={t.home.joining} className={`${primaryButton} self-start`} />
        </form>
      </section>
    </>
  );
}
