"use client";

import { useActionState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { discreetButton, primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { closeRoomAction, type HostActionState, nextRoundAction } from "@/server/rooms/actions";

type HostRoundActionsProps = {
  readonly t: Dictionary["rooms"]["hostActions"];
  /** The race whose results the page shows; absent in the waiting room, where only closing is offered. */
  readonly raceId?: string;
};

/**
 * The host after a race (COURSE-11, screen 10): the next round for everyone present, the one red
 * action, then closing the room. In the waiting room, closing only. The server checks the host
 * and the room's phase under its lock; the pages learn the result from the room's snapshot.
 */
export function HostRoundActions({ t, raceId }: HostRoundActionsProps) {
  const [next, nextAction] = useActionState<HostActionState, FormData>(nextRoundAction, {});
  const [close, closeAction] = useActionState<HostActionState, FormData>(closeRoomAction, {});
  const error = next.error ?? close.error;
  return (
    <section aria-label={t.label} className="flex max-w-xl flex-col gap-3">
      <div className="flex flex-wrap items-start gap-3">
        {raceId !== undefined && (
          <form action={nextAction}>
            <input type="hidden" name="raceId" value={raceId} />
            <SubmitButton label={t.nextRound} pendingLabel={t.nextRoundPending} className={primaryButton} describedBy="next-round-note" />
          </form>
        )}
        <form action={closeAction}>
          <SubmitButton label={t.close} pendingLabel={t.closePending} className={discreetButton} describedBy="close-room-note" />
        </form>
      </div>
      {raceId !== undefined && (
        <p id="next-round-note" className="text-sm text-brume">
          {t.nextRoundNote}
        </p>
      )}
      <p id="close-room-note" className="text-sm text-brume">
        {t.closeNote}
      </p>
      {error !== undefined && <FormAlert message={t.errors[error]} />}
    </section>
  );
}
