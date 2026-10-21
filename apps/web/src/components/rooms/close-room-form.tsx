"use client";

import { unstable_rethrow, useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { destructiveLink } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { closeRoomAction, type HostActionError } from "@/server/rooms/actions";
import { FIRST_VIEW, type HostRoundView, isStaleRefusal, nextHostRoundView } from "./host-round-view";

type CloseRoomFormProps = {
  readonly t: Dictionary["rooms"]["hostActions"];
  /** The room the page shows: closing applies to it only. */
  readonly code: string;
  /** The consequences, read with the button. */
  readonly describedBy?: string;
  /** Told while the closing is on its way, and when it answered. */
  readonly onPendingChange?: (pending: boolean) => void;
};

/**
 * The confirming form of « Fermer la salle ». Its answer lives with it: the question gone, a
 * refusal goes too, and reopening the question starts clean (as the host's leave does).
 */
export function CloseRoomForm({ t, code, describedBy, onPendingChange }: CloseRoomFormProps) {
  const router = useRouter();
  const [view, act, pending] = useActionState<HostRoundView, FormData>(async (previous, formData) => {
    let error: HostActionError | undefined;
    try {
      ({ error } = await closeRoomAction(formData));
    } catch (thrown: unknown) {
      // Next's own signals (a redirect to sign in) go through; anything else did not reach the server.
      unstable_rethrow(thrown);
      error = "UNAVAILABLE";
    }
    return nextHostRoundView(previous, error, "close");
  }, FIRST_VIEW);
  useEffect(() => {
    onPendingChange?.(pending);
  }, [pending, onPendingChange]);
  useEffect(() => {
    if (isStaleRefusal(view.error)) {
      router.refresh();
    }
  }, [view, router]);
  return (
    <form action={act} className="flex flex-col gap-3">
      <input type="hidden" name="code" value={code} />
      <SubmitButton label={t.closeConfirm} pendingLabel={t.closePending} className={`${destructiveLink} self-start`} describedBy={describedBy} />
      {view.error !== undefined && <FormAlert key={view.attempt} message={t.errors[view.error]} />}
    </form>
  );
}
