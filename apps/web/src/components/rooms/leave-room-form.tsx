"use client";

import { useActionState, useEffect } from "react";
import { SubmitButton } from "@/components/submit-button";
import { FormAlert } from "@/components/ui/form-alert";
import { discreetButton } from "@/components/ui/styles";
import { leaveRoomAction, type LeaveRoomState } from "@/server/rooms/actions";

type LeaveRoomFormProps = {
  readonly label: string;
  readonly pendingLabel: string;
  readonly errors: Readonly<Record<NonNullable<LeaveRoomState["error"]>, string>>;
  readonly returnTo?: string;
  /** Id of the note saying what leaving does (the host closes the room). */
  readonly describedBy?: string;
  /** Told when the person submits, before the server answers. */
  readonly onLeaving?: () => void;
  /** Told when the server could not record the departure. */
  readonly onFailed?: () => void;
};

/** Leaves the current room on the server, then goes to `returnTo` (home by default). */
export function LeaveRoomForm({ label, pendingLabel, errors, returnTo = "/", describedBy, onLeaving, onFailed }: LeaveRoomFormProps) {
  const [state, formAction] = useActionState<LeaveRoomState, FormData>(leaveRoomAction, {});
  useEffect(() => {
    if (state.error !== undefined) {
      onFailed?.();
    }
  }, [state, onFailed]);
  return (
    <form action={formAction} onSubmit={onLeaving} className="flex flex-col gap-3">
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton label={label} pendingLabel={pendingLabel} className={`${discreetButton} self-start`} describedBy={describedBy} />
      {state.error !== undefined && <FormAlert message={errors[state.error]} />}
    </form>
  );
}
