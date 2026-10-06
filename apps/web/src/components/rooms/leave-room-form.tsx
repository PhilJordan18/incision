import { SubmitButton } from "@/components/submit-button";
import { discreetButton } from "@/components/ui/styles";
import { leaveRoomAction } from "@/server/rooms/actions";

type LeaveRoomFormProps = { readonly label: string; readonly pendingLabel: string; readonly returnTo?: string };

/** Leaves the current room on the server, then goes to `returnTo` (home by default). */
export function LeaveRoomForm({ label, pendingLabel, returnTo = "/" }: LeaveRoomFormProps) {
  return (
    <form action={leaveRoomAction}>
      <input type="hidden" name="returnTo" value={returnTo} />
      <SubmitButton label={label} pendingLabel={pendingLabel} className={discreetButton} />
    </form>
  );
}
