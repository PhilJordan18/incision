"use client";

import { RACE_MIN_PARTICIPANTS } from "@incision/domain";
import { useState } from "react";
import { primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import type { RaceStartAck, RaceStartError } from "@/races/protocol";

type StartRaceButtonProps = {
  readonly start: () => Promise<RaceStartAck>;
  readonly participants: number;
  readonly t: Dictionary["races"];
  readonly note?: string;
};

/**
 * The host starts the race (COURSE-02): the one red action of the waiting room. The server
 * decides (host, phase, the engine's start rule); this button only says why it refused.
 */
export function StartRaceButton({ start, participants, t, note }: StartRaceButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RaceStartError | undefined>(undefined);
  // A hint only, from the engine's constant: the server applies the engine's start rule itself.
  const enough = participants >= RACE_MIN_PARTICIPANTS;
  async function onClick(): Promise<void> {
    if (pending) {
      return;
    }
    setPending(true);
    setError(undefined);
    // Started: the button stays pending until the race replaces the waiting room, so a second
    // press cannot send another start meanwhile.
    try {
      const answer = await start();
      if (!answer.ok) {
        setError(answer.error);
        setPending(false);
      }
    } catch {
      setError("UNAVAILABLE");
      setPending(false);
    }
  }
  return (
    <div className="flex max-w-md flex-col gap-2">
      {/* aria-disabled while starting: a disabled button would drop the keyboard focus. */}
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={!enough}
        aria-disabled={pending}
        aria-describedby="start-note"
        className={`${primaryButton} self-start aria-disabled:cursor-progress`}
      >
        {pending ? t.starting : t.start}
      </button>
      <p id="start-note" className="text-sm text-brume">
        {enough ? (note ?? t.startNote) : t.startNeedsTwo}
      </p>
      <p role="alert" className="min-h-5 text-sm text-erreur">
        {error === undefined ? "" : `⚠ ${t.startErrors[error]}`}
      </p>
    </div>
  );
}
