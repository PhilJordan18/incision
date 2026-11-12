import panels from "@/components/races/race-panels.module.css";
import { monoLabel } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { raceScreenMessages } from "@/i18n/dictionaries/race-screen";
import type { Locale } from "@/i18n/locale";
import { format } from "@/i18n/format";
import type { BonusClientError, BonusClientState } from "@/races/bonus-client";
import type { RaceClientState } from "@/races/race-client";

/**
 * Beside the track, a logbook (#51): each bonus with its name, what it does, whether Enter in
 * « Ta frappe » uses it now, then what happened. Never above the typing area or inside a
 * confirmation. Facts, not optimistic effects; no rule is said here that the server does not apply.
 */
export function RaceBonuses({ state, race, t, locale }: {
  readonly state: BonusClientState;
  readonly race: RaceClientState;
  readonly t: Dictionary["races"]["bonuses"];
  readonly locale: Locale;
}) {
  if (state.self?.enabled !== true && state.announcements.length === 0) return null;
  const names = new Map(race.entrants.map(entrant => [entrant.entrantId, entrant.displayName]));
  const active = race.progress?.phase === "racing" && race.typing?.status === "racing" && !race.confirming;
  const usable = active && race.control === "controlling" && state.synchronized && !state.sending;
  const hint = !active ? t.over : race.control !== "controlling" ? t.observing : !state.synchronized
    ? t.sync : state.sending ? t.sending : t.hint;
  const text = raceScreenMessages[locale];
  return (
    <section aria-labelledby="race-bonuses-heading" className={`${panels.log} flex min-w-0 flex-col gap-2 border-arcade lg:h-full`}>
      <h2 id="race-bonuses-heading" className={`${panels.logHeading} font-display text-2xl font-extrabold uppercase text-arcade`}>{t.heading}</h2>
      {/* In the race's row the log scrolls in its panel: a keyboard stop of its own (WCAG 2.1.1). */}
      <div tabIndex={0} role="group" aria-label={text.bonusLog}
        className="flex min-h-0 grow flex-col gap-2 overflow-y-auto rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moi">
      {state.self?.enabled === true && <>
        <p className={monoLabel}>{t.inventory}</p>
        <ol aria-label={t.inventory} className="flex flex-col gap-2">
          {state.self.grants.map((grant, index) => <li key={grant.milestone} data-bonus={grant.kind} className="flex gap-2 text-sm">
            <BonusMark kind={grant.kind} />
            <span className="flex min-w-0 flex-col">
              <span>
                <span className="font-semibold">{t.kinds[grant.kind]}</span>{" · "}
                {format(t.milestone, { milestone: grant.milestone })}{" · "}
                <span className={index === 0 && usable ? "font-semibold text-arcade" : "text-brume"}>
                  {index === 0 ? `${t.next} · ${usable ? text.bonusReady : text.bonusWaiting}` : text.bonusQueued}
                </span>
              </span>
              <span className="text-embrun">{text.bonusEffects[grant.kind]}</span>
            </span>
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
      </div>
    </section>
  );
}

/** A small nautical mark per bonus, drawn in SVG: a shortcut's bearing, an anchor's drag, a fog bank. Decorative. */
function BonusMark({ kind }: { readonly kind: keyof Dictionary["races"]["bonuses"]["kinds"] }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="mt-0.5 size-4 shrink-0 fill-none stroke-arcade" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {kind === "shortenSelf" && <><path d="M2 13 L13 3" /><path d="M8 3 H13 V8" /><circle cx="2.5" cy="12.5" r="1" /></>}
      {kind === "extendLeader" && <><circle cx="8" cy="3" r="1.5" /><path d="M8 4.5 V14" /><path d="M5 7 H11" /><path d="M3 10 Q3 14 8 14 Q13 14 13 10" /></>}
      {kind === "fogLeader" && <><path d="M2 5 Q4 3.5 6 5 T10 5 T14 5" /><path d="M2 9 Q4 7.5 6 9 T10 9 T14 9" /><path d="M2 13 Q4 11.5 6 13 T10 13 T14 13" /></>}
    </svg>
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
