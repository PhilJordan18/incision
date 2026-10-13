"use client";

import { useState } from "react";
import { secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { ConfirmClosing, consequencesId } from "./confirm-closing";
import { LeaveRoomForm } from "./leave-room-form";

type HostLeaveConfirmProps = {
  readonly t: Dictionary["rooms"];
  /** Unique on the page: names the question's heading. */
  readonly id: string;
  /** The room the host would leave, and so close. */
  readonly code: string;
  /** The button that asks first (« Quitter la salle », or a panel's own wording). */
  readonly openLabel: string;
  readonly describedBy?: string;
  /** Where the host goes once the room is closed, said among the consequences. */
  readonly afterwards: string;
  readonly returnTo?: string;
  /** A race counts down or runs in that room: it stops without results. */
  readonly racing?: boolean;
  readonly onLeaving?: () => void;
  readonly onFailed?: () => void;
};

/**
 * The host leaving closes the room for everyone (CP-06): wherever « Quitter » is offered to the
 * host, it asks first with the same consequences as « Fermer la salle » (decided on 12 October).
 */
export function HostLeaveConfirm({ t, id, code, openLabel, describedBy, afterwards, returnTo, racing = false, onLeaving, onFailed }: HostLeaveConfirmProps) {
  const [busy, setBusy] = useState(false);
  // The heaviest consequence right after the closing itself.
  const [closing, ...rest] = t.hostLeave.consequences;
  const consequences = [...(closing === undefined ? [] : [closing]), ...(racing ? [t.hostLeave.racing] : []), ...rest, afterwards];
  return (
    <ConfirmClosing
      id={id}
      openLabel={openLabel}
      describedBy={describedBy}
      question={format(t.hostLeave.question, { code })}
      consequences={consequences}
      cancelLabel={t.hostLeave.cancel}
      busy={busy}
    >
      <LeaveRoomForm
        label={t.hostLeave.confirm}
        pendingLabel={t.leaving}
        errors={t.changeErrors}
        returnTo={returnTo}
        describedBy={consequencesId(id)}
        onLeaving={onLeaving}
        onFailed={onFailed}
        onPendingChange={setBusy}
        buttonClassName={`${secondaryButton} self-start`}
      />
    </ConfirmClosing>
  );
}
