"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { discreetButton, primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { closeRoomAction, type HostActionError, nextRoundAction } from "@/server/rooms/actions";

type HostRoundActionsProps = {
  readonly t: Dictionary["rooms"]["hostActions"];
  /** The room the page shows: closing applies to it only. */
  readonly code: string;
  /** The race whose results the page shows; absent in the waiting room, where only closing is offered. */
  readonly raceId?: string;
  /** Next to the primary action, as on screen 10 (the race's own page). */
  readonly secondary?: ReactNode;
};

/** The latest answer only, numbered so the same refusal twice is announced twice. */
type View = { readonly error?: HostActionError; readonly attempt: number };

/** Refusals that mean the page shows a room or a race that has moved on: the server's page says where it is. */
const STALE: readonly HostActionError[] = ["NOT_IN_A_ROOM", "NOT_ON_RESULTS"];

/**
 * The host after a race (COURSE-11, screen 10): the next round for everyone present, the one red
 * action, then closing the room. In the waiting room, closing only. The server checks the host
 * and the room's phase under its lock; the pages learn the result from the room's snapshot.
 */
export function HostRoundActions({ t, code, raceId, secondary }: HostRoundActionsProps) {
  const router = useRouter();
  const [view, act] = useActionState<View, FormData>(async (previous, formData) => {
    let error: HostActionError | undefined;
    try {
      ({ error } = formData.get("intent") === "close" ? await closeRoomAction(formData) : await nextRoundAction(formData));
    } catch {
      error = "UNAVAILABLE";
    }
    return { error, attempt: previous.attempt + 1 };
  }, { attempt: 0 });

  useEffect(() => {
    if (view.error !== undefined && STALE.includes(view.error)) {
      router.refresh();
    }
  }, [view, router]);

  const buttons = (
    <div className="flex flex-wrap items-start gap-3">
      {raceId !== undefined && (
        <form action={act}>
          <input type="hidden" name="intent" value="next" />
          <input type="hidden" name="raceId" value={raceId} />
          <SubmitButton label={t.nextRound} pendingLabel={t.nextRoundPending} className={primaryButton} describedBy="next-round-note" />
        </form>
      )}
      {secondary}
      <form action={act}>
        <input type="hidden" name="intent" value="close" />
        <input type="hidden" name="code" value={code} />
        <SubmitButton label={t.close} pendingLabel={t.closePending} className={discreetButton} describedBy="close-room-note" />
      </form>
    </div>
  );
  const notes = (
    <>
      {raceId !== undefined && (
        <p id="next-round-note" className="text-sm text-brume">
          {t.nextRoundNote}
        </p>
      )}
      <p id="close-room-note" className="text-sm text-brume">
        {t.closeNote}
      </p>
      {view.error !== undefined && <FormAlert key={view.attempt} message={t.errors[view.error]} />}
    </>
  );
  // On the results, the host's own group; in the waiting room, closing sits under the start alone.
  return raceId !== undefined ? (
    <section aria-label={t.label} className="flex max-w-xl flex-col gap-3">
      {buttons}
      {notes}
    </section>
  ) : (
    <div className="flex max-w-xl flex-col gap-3">
      {buttons}
      {notes}
    </div>
  );
}
