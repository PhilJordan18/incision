"use client";

import { useState } from "react";
import { destructiveLink } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { ConfirmClosing, consequencesId } from "./confirm-closing";
import { LeaveRoomForm } from "./leave-room-form";

type HostLeaveConfirmProps = {
  readonly guest?: boolean;
  readonly t: Dictionary["rooms"];
  /** Unique on the page: names the question's heading. */
  readonly id: string;
  /** The room the host would leave. */
  readonly code: string;
  /** The button that asks first (« Quitter la salle »). */
  readonly openLabel: string;
  readonly describedBy?: string;
  /** A race counts down or runs: explain abandonment and conditional interruption. */
  readonly racing?: boolean;
  /** Where the focus goes once the host stays (see ConfirmClosing). */
  readonly focusAfterKeeping?: (opener: HTMLButtonElement | null) => void;
  readonly onLeaving?: () => void;
  readonly onFailed?: () => void;
};

/**
 * A host confirms succession, or closure when no connected human remains (SALLE-08).
 * Keep this question below the typing field so confirmation never shifts the race text.
 */
export function HostLeaveConfirm({ guest = false, t, id, code, openLabel, describedBy, racing = false, focusAfterKeeping, onLeaving, onFailed }: HostLeaveConfirmProps) {
  const [busy, setBusy] = useState(false);
  // Explain the race consequence immediately after succession or closure.
  const [closing, kept] = t.hostLeave.consequences;
  const consequences = [closing, ...(racing ? [t.hostLeave.racing] : []), ...(guest ? [] : [kept]), t.hostLeave.backHome];
  return (
    <ConfirmClosing
      id={id}
      openLabel={openLabel}
      describedBy={describedBy}
      warning={t.hostLeave.warning}
      question={format(t.hostLeave.question, { code })}
      consequences={consequences}
      cancelLabel={t.hostLeave.cancel}
      busy={busy}
      focusAfterKeeping={focusAfterKeeping}
    >
      <LeaveRoomForm guest={guest}
        label={t.hostLeave.confirm}
        pendingLabel={t.leaving}
        errors={t.changeErrors}
        describedBy={consequencesId(id)}
        onLeaving={onLeaving}
        onFailed={onFailed}
        onPendingChange={setBusy}
        buttonClassName={`${destructiveLink} self-start`}
      />
    </ConfirmClosing>
  );
}
