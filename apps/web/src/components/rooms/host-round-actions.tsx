"use client";

import { guestAwareAction } from "@/identity/guest-browser";
import { guestNextRoundAction } from "@/server/rooms/guest-actions";

import { unstable_rethrow, useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect, useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { type HostActionError, nextRoundAction } from "@/server/rooms/actions";
import { CloseRoomForm } from "./close-room-form";
import { ConfirmClosing, consequencesId } from "./confirm-closing";
import { FIRST_VIEW, type HostRoundView, isStaleRefusal, nextHostRoundView } from "./host-round-view";

type HostRoundActionsProps = {
  readonly guest?: boolean;
  readonly t: Dictionary["rooms"]["hostActions"];
  /** The room the page shows: closing applies to it only. */
  readonly code: string;
  /** The race whose results the page shows; absent in the waiting room (or while the results load), where only closing is offered. */
  readonly raceId?: string;
  /** Next to the primary action, as on screen 10 (the race's own page). */
  readonly secondary?: ReactNode;
};

/**
 * The host after a race (COURSE-11, screen 10): the next round for everyone present, the one red
 * action, with the race's page beside it; then, on a line of its own, closing the room, which
 * asks first. In the waiting room, closing only. The server checks the host and the room's phase
 * under its lock; the pages learn the result from the room's snapshot.
 */
export function HostRoundActions({ guest = false, t, code, raceId, secondary }: HostRoundActionsProps) {
  const router = useRouter();
  const [view, act] = useActionState<HostRoundView, FormData>(async (previous, formData) => {
    let error: HostActionError | undefined;
    try {
      ({ error } = await guestAwareAction(guest, () => guest ? guestNextRoundAction(formData) : nextRoundAction(formData)));
    } catch (thrown: unknown) {
      // Next's own signals (a redirect to sign in) go through; anything else did not reach the server.
      unstable_rethrow(thrown);
      error = "UNAVAILABLE";
    }
    return nextHostRoundView(previous, error, "next");
  }, FIRST_VIEW);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (isStaleRefusal(view.error)) {
      router.refresh();
    }
  }, [view, router]);

  const next =
    raceId === undefined ? null : (
      <>
        <div className="flex flex-wrap items-start gap-3">
          <form action={act}>
            <input type="hidden" name="raceId" value={raceId} />
            <SubmitButton label={t.nextRound} pendingLabel={t.nextRoundPending} className={primaryButton} describedBy="next-round-note" />
          </form>
          {secondary}
        </div>
        <p id="next-round-note" className="text-sm text-brume">
          {t.nextRoundNote}
        </p>
        {view.error !== undefined && <FormAlert key={view.attempt} message={t.errors[view.error]} />}
      </>
    );
  const close = (
    <div className="flex flex-col gap-2">
      <ConfirmClosing
        id="close-room"
        openLabel={t.close}
        describedBy="close-room-note"
        warning={t.closeWarning}
        question={t.closeQuestion}
        consequences={t.closeConsequences}
        cancelLabel={t.closeCancel}
        busy={closing}
      >
        <CloseRoomForm guest={guest} t={t} code={code} describedBy={consequencesId("close-room")} onPendingChange={setClosing} />
      </ConfirmClosing>
      <p id="close-room-note" className="text-sm text-brume">
        {t.closeNote}
      </p>
    </div>
  );
  // On the results, the host's own group; in the waiting room, closing sits under the start alone.
  return raceId !== undefined ? (
    <section aria-label={t.label} className="flex max-w-xl flex-col gap-3">
      {next}
      {close}
    </section>
  ) : (
    <div className="flex max-w-xl flex-col gap-3">
      {close}
    </div>
  );
}
