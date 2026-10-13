"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { primaryButton, secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { closeRoomAction, type HostActionError, nextRoundAction } from "@/server/rooms/actions";
import { ConfirmClosing, consequencesId } from "./confirm-closing";
import { FIRST_VIEW, type HostRoundView, isStaleRefusal, nextHostRoundView } from "./host-round-view";

type HostRoundActionsProps = {
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
export function HostRoundActions({ t, code, raceId, secondary }: HostRoundActionsProps) {
  const router = useRouter();
  const [view, act, pending] = useActionState<HostRoundView, FormData>(async (previous, formData) => {
    let error: HostActionError | undefined;
    try {
      ({ error } = formData.get("intent") === "close" ? await closeRoomAction(formData) : await nextRoundAction(formData));
    } catch (thrown: unknown) {
      // Next's own signals (a redirect to sign in) go through; anything else did not reach the server.
      unstable_rethrow(thrown);
      error = "UNAVAILABLE";
    }
    return nextHostRoundView(previous, error, formData.get("intent") === "close" ? "close" : "next");
  }, FIRST_VIEW);

  useEffect(() => {
    if (isStaleRefusal(view.error)) {
      router.refresh();
    }
  }, [view, router]);

  // Next to the action that failed.
  const alertFor = (intent: "next" | "close") =>
    view.error !== undefined && view.intent === intent && <FormAlert key={view.attempt} message={t.errors[view.error]} />;
  const next =
    raceId === undefined ? null : (
      <>
        <div className="flex flex-wrap items-start gap-3">
          <form action={act}>
            <input type="hidden" name="intent" value="next" />
            <input type="hidden" name="raceId" value={raceId} />
            <SubmitButton label={t.nextRound} pendingLabel={t.nextRoundPending} className={primaryButton} describedBy="next-round-note" />
          </form>
          {secondary}
        </div>
        <p id="next-round-note" className="text-sm text-brume">
          {t.nextRoundNote}
        </p>
        {alertFor("next")}
      </>
    );
  const close = (
    <div className="flex flex-col gap-2">
      <ConfirmClosing
        id="close-room"
        openLabel={t.close}
        describedBy="close-room-note"
        question={t.closeQuestion}
        consequences={t.closeConsequences}
        cancelLabel={t.closeCancel}
        busy={pending}
        alert={alertFor("close")}
      >
        <form action={act}>
          <input type="hidden" name="intent" value="close" />
          <input type="hidden" name="code" value={code} />
          <SubmitButton label={t.closeConfirm} pendingLabel={t.closePending} className={secondaryButton} describedBy={consequencesId("close-room")} />
        </form>
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
