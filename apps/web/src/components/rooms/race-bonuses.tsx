import { card, monoLabel } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import type { BonusClientError, BonusClientState } from "@/races/bonus-client";
import type { RaceClientState } from "@/races/race-client";

/** On the track, never above the typing area or inside a confirmation. Facts, not optimistic effects. */
export function RaceBonuses({ state, race, t }: {
  readonly state: BonusClientState;
  readonly race: RaceClientState;
  readonly t: Dictionary["races"]["bonuses"];
}) {
  if (state.self?.enabled !== true && state.announcements.length === 0) return null;
  const names = new Map(race.entrants.map(entrant => [entrant.entrantId, entrant.displayName]));
  const active = race.progress?.phase === "racing" && race.typing?.status === "racing" && !race.confirming;
  const hint = !active ? t.over : race.control !== "controlling" ? t.observing : !state.synchronized
    ? t.sync : state.sending ? t.sending : t.hint;
  return (
    <section aria-labelledby="race-bonuses-heading" className={`${card} flex flex-col gap-3 border-arcade`}>
      <h2 id="race-bonuses-heading" className="font-display text-2xl font-extrabold uppercase text-arcade">{t.heading}</h2>
      {state.self?.enabled === true && <>
        <p className={monoLabel}>{t.inventory}</p>
        <ol aria-label={t.inventory} className="flex flex-col gap-2">
          {state.self.grants.map((grant, index) => <li key={grant.milestone} className="text-sm">
            <span className="font-semibold">{t.kinds[grant.kind]}</span>{" · "}
            {format(t.milestone, { milestone: grant.milestone })}{index === 0 ? ` · ${t.next}` : ""}
          </li>)}
        </ol>
        <p role="status" className="text-sm text-embrun">{state.self.grants.length === 0 ? t.empty : hint}</p>
        <p role="status" className="min-h-10 text-sm text-embrun">
          {state.error !== undefined ? <><span aria-hidden="true">⚠ </span>{bonusErrorText(state.error, t)}</> : state.fogVisible ? t.fog : ""}
        </p>
      </>}
      {/* At most six, never a scrolling box: a region that scrolls must be reachable with the keyboard (WCAG 2.1.1). */}
      <ol aria-label={t.events} aria-live="polite" aria-relevant="additions" className="flex flex-col gap-2 text-sm text-embrun">
        {state.announcements.slice(-6).map(({ announcement }) => announcement.type === "activated"
          ? <li key={announcement.receipt.id}>{format(t.activated, {
            actor: names.get(announcement.receipt.grant.entrantId) ?? t.player,
            kind: t.kinds[announcement.receipt.grant.kind],
            target: names.get(announcement.receipt.targetId) ?? t.player,
          })}</li>
          : <li key={announcement.id}>{format(t.fogEnded, { target: names.get(announcement.entrantId) ?? t.player })}</li>)}
      </ol>
    </section>
  );
}

export function bonusErrorText(error: BonusClientError, t: Dictionary["races"]["bonuses"]): string {
  switch (error) {
    case "ACK_TIMEOUT": case "INVALID_RESPONSE": case "OFFLINE": return t.unconfirmed;
    case "CONTENT_UNAVAILABLE": return t.contentUnavailable;
    case "RATE_LIMITED": return t.rateLimited;
    case "FOG_ALREADY_ACTIVE": return t.fogActive;
    case "NO_VALID_TARGET": return t.noTarget;
    case "NO_REMOVABLE_WORD": return t.noWord;
    case "NOT_CONTROLLING": return t.observing;
    case "SUSPENDED": return t.sync;
    default: return t.refused;
  }
}
