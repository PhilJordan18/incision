"use client";

import { useState } from "react";
import { primaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import type { RaceStartAck, RaceStartError } from "@/races/protocol";

type StartRaceButtonProps = {
  readonly start: () => Promise<RaceStartAck>;
  readonly participants: number;
  readonly t: Dictionary["races"];
};

/**
 * The host starts the race (COURSE-02): the one red action of the waiting room. The server
 * decides (host, phase, the engine's start rule); this button only says why it refused.
 */
export function StartRaceButton({ start, participants, t }: StartRaceButtonProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<RaceStartError | undefined>(undefined);
  const enough = participants >= 2;
  async function onClick(): Promise<void> {
    setPending(true);
    setError(undefined);
    try {
      const answer = await start();
      if (!answer.ok) {
        setError(answer.error);
      }
    } catch {
      setError("UNAVAILABLE");
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="flex max-w-md flex-col gap-2">
      <button type="button" onClick={() => void onClick()} disabled={pending || !enough} aria-describedby="start-note" className={`${primaryButton} self-start`}>
        {pending ? t.starting : t.start}
      </button>
      <p id="start-note" className="text-sm text-brume">
        {enough ? t.startNote : t.startNeedsTwo}
      </p>
      <p role="alert" className="min-h-5 text-sm text-erreur">
        {error === undefined ? "" : `⚠ ${t.startErrors[error]}`}
      </p>
    </div>
  );
}
