"use client";

import { containsLineBreak, toGraphemes } from "@incision/domain";
import { memo, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { card, monoLabel, secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { formatAccuracy, formatClock, formatProgress, formatWpm } from "@/races/format";
import type { RaceClient, RaceClientState } from "@/races/race-client";

type RaceViewProps = {
  readonly race: RaceClient;
  readonly t: Dictionary["races"];
  readonly locale: Locale;
  readonly roomLabel: string;
  /** The race the room's snapshot names: a reveal of another (an older round) is not this race. */
  readonly expectedRaceId: string | undefined;
  /** Asks the server to move the input to this tab (state-machines §2). */
  readonly onTakeControl: (raceId: string) => void;
};

const TYPING_INPUT_ID = "race-typing";

/**
 * The race in a room (screens 07 and 08, first path): the 3-2-1 countdown on the server's
 * clock, then the text, the typing field and everyone's progress. What is typed shows at once
 * (the engine's prediction); progress, measures and results come from the server.
 */
export function RaceView({ race, t, locale, roomLabel, expectedRaceId, onTakeControl }: RaceViewProps) {
  const state = useSyncExternalStore(race.subscribe, race.getState, race.getState);
  const now = useServerClock(race, state);
  const reveal = expectedRaceId === undefined || state.reveal?.raceId === expectedRaceId ? state.reveal : undefined;
  const waitedLong = useWaitedLong(reveal === undefined);
  if (reveal === undefined) {
    // The room counts down or races, but no race reached this tab: it runs elsewhere (two
    // processes overlapping) or its process stopped; the room recovers it once its lease ends.
    return (
      <p role="status" className="text-embrun">
        {waitedLong ? t.elsewhere : t.preparing}
      </p>
    );
  }
  const phase = state.progress?.phase ?? (now < reveal.startsAt ? "countdown" : "racing");
  const counting = phase === "countdown" && now < reveal.startsAt;
  const selfProgress = state.progress?.entrants.find((entrant) => entrant.entrantId === state.selfEntrantId);
  const typedCount = state.typing?.typed.length ?? selfProgress?.position ?? 0;
  const length = reveal.text.length;
  const remaining = reveal.timeLimit === null ? undefined : reveal.timeLimit - Math.max(0, now - reveal.startsAt);
  const seconds = Math.max(1, Math.ceil((reveal.startsAt - now) / 1_000));
  // Over the faded text (screen 07), so that nothing moves when typing opens.
  const countdown = counting ? <Countdown seconds={seconds} t={t} /> : undefined;
  // One speed for "me", the broadcast's, as on the track; accuracy from the server's measures.
  const speed = selfProgress?.netWpm ?? state.measures?.netWpm ?? 0;
  const typedAnything = (state.typing?.totalInserts ?? 0) > 0;
  return (
    <div className="flex flex-col gap-6">
      <p className={`${monoLabel} flex flex-wrap gap-x-4 gap-y-1`}>
        <span>
          <span aria-hidden="true">[.</span>
          {roomLabel}
          <span aria-hidden="true">]</span>
        </span>
        {reveal.timeLimit !== null && (
          <span>
            <span aria-hidden="true">[.</span>
            {format(t.timeLimit, { minutes: Math.round(reveal.timeLimit / 60_000) })}
            <span aria-hidden="true">]</span>
          </span>
        )}
      </p>

      {/* One live region from the reveal on: 3, 2, 1, then the start, announced once each. */}
      <p aria-live="assertive" aria-atomic="true" className="sr-only">
        {counting ? String(seconds) : t.countdownGo}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
        <div className="flex min-w-0 flex-col gap-5">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t.tiles.time} value={remaining === undefined ? "—" : formatClock(counting ? reveal.timeLimit ?? 0 : remaining)} />
            {state.selfEntrantId !== null && (
              <>
                <Tile label={t.tiles.speed} value={formatWpm(speed, locale)} unit={t.wpm} />
                <Tile label={t.tiles.accuracy} value={typedAnything ? formatAccuracy(state.measures?.accuracy ?? 0, locale) : "—"} />
                <Tile label={t.tiles.progress} value={formatProgress(typedCount, length, locale)} />
              </>
            )}
          </dl>

          {state.selfEntrantId === null ? (
            <>
              <p className="text-embrun">{t.spectating}</p>
              <RaceText target={reveal.text} typing={undefined} label={t.textLabel} language={state.language ?? locale} overlay={countdown} />
            </>
          ) : (
            <TypingZone
              race={race}
              state={state}
              t={t}
              canType={!counting && phase === "racing"}
              onTakeControl={onTakeControl}
              overlay={countdown}
              language={state.language ?? locale}
            />
          )}

          {state.confirming && (
            <p role="status" className={`${card} border-or text-embrun`}>
              <span aria-hidden="true">… </span>
              {t.confirming}
            </p>
          )}
        </div>

        <Track state={state} t={t} locale={locale} />
      </div>
    </div>
  );
}

/** Without a race after this long, the view says the race is not run here. */
const ELSEWHERE_AFTER_MS = 5_000;

function useWaitedLong(waiting: boolean): boolean {
  const [waitedLong, setWaitedLong] = useState(false);
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setTimeout(() => setWaitedLong(true), ELSEWHERE_AFTER_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  return waiting && waitedLong;
}

/** Re-renders every 100 ms while the race counts down or runs, on the server's clock. */
function useServerClock(race: RaceClient, state: RaceClientState): number {
  const [now, setNow] = useState(() => race.serverNow());
  const ticking = state.reveal !== undefined && state.progress?.phase !== "ended" && state.progress?.phase !== "interrupted";
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNow(race.serverNow()), 100);
    return () => clearInterval(timer);
  }, [race, ticking]);
  return now;
}

/**
 * Screen 07 over the faded text: the digit in its ring. A timer for assistive technology, whose
 * announcements come from the view's single live region.
 */
function Countdown({ seconds, t }: { readonly seconds: number; readonly t: Dictionary["races"] }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-carte bg-nuit/85">
      <p id="countdown-label" className={monoLabel}>
        {t.countdownLabel}
      </p>
      <p
        role="timer"
        aria-labelledby="countdown-label"
        className="grid size-28 place-items-center rounded-full border-4 border-ligne font-display text-7xl leading-none font-black sm:size-36 sm:text-8xl"
      >
        {seconds}
      </p>
      <p className="font-serif text-2xl italic">{t.countdownMood}</p>
    </div>
  );
}

function TypingZone({
  race,
  state,
  t,
  canType,
  onTakeControl,
  overlay,
  language,
}: {
  readonly race: RaceClient;
  readonly state: RaceClientState;
  readonly t: Dictionary["races"];
  readonly canType: boolean;
  readonly onTakeControl: (raceId: string) => void;
  readonly overlay: ReactNode;
  readonly language: Locale;
}) {
  const input = useRef<HTMLInputElement>(null);
  const { typing, block, reveal } = state;
  const enabled = canType && block === undefined;
  const finished = typing?.status === "finished";

  // The field takes the focus when typing opens: at "Go", or when this tab takes the input.
  useEffect(() => {
    if (enabled) {
      input.current?.focus();
    }
  }, [enabled]);

  // Native `beforeinput`, which React does not expose with its input type.
  useEffect(() => {
    const field = input.current;
    if (field === null) {
      return;
    }
    const insert = (data: string) => {
      // Enter is reserved (D-16): never a keystroke, whatever the input method sends.
      if (data.length === 0 || containsLineBreak(data)) {
        return;
      }
      for (const grapheme of toGraphemes(data)) {
        race.type({ type: "insert", grapheme });
      }
    };
    const onBeforeInput = (event: InputEvent) => {
      if (event.inputType === "insertCompositionText") {
        // An input method composes; its result arrives with `compositionend`.
        return;
      }
      event.preventDefault();
      if (event.inputType === "insertText" && event.data !== null) {
        insert(event.data);
      }
      // Pasting, dropping, line breaks and other edits are refused (screen 08).
    };
    const onCompositionEnd = (event: CompositionEvent) => {
      insert(event.data);
      field.value = "";
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        event.preventDefault();
        race.type({ type: "deleteBackward" });
      } else if (event.key === "Enter") {
        event.preventDefault();
      }
    };
    const refuse = (event: Event) => event.preventDefault();
    field.addEventListener("beforeinput", onBeforeInput);
    field.addEventListener("compositionend", onCompositionEnd);
    field.addEventListener("keydown", onKeyDown);
    field.addEventListener("paste", refuse);
    field.addEventListener("drop", refuse);
    return () => {
      field.removeEventListener("beforeinput", onBeforeInput);
      field.removeEventListener("compositionend", onCompositionEnd);
      field.removeEventListener("keydown", onKeyDown);
      field.removeEventListener("paste", refuse);
      field.removeEventListener("drop", refuse);
    };
  }, [race]);

  const expected = typing?.pendingError === true ? typing.target[typing.typed.length] : undefined;
  const message =
    block === "observing"
      ? t.observing
      : block === "suspended"
        ? t.suspended
        : block === "reload"
          ? t.reload
          : finished
            ? t.finished
            : expected !== undefined
              ? expected === " "
                ? t.blockedSpace
                : format(t.blocked, { expected })
              : t.typingHint;
  return (
    <div className="flex flex-col gap-4">
      <RaceText target={reveal?.text ?? []} typing={typing} label={t.textLabel} language={language} overlay={overlay} />
      <div className="flex flex-col gap-2">
        <label htmlFor={TYPING_INPUT_ID} className={monoLabel}>
          {t.typingLabel}
        </label>
        <input
          ref={input}
          id={TYPING_INPUT_ID}
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={!enabled}
          aria-invalid={expected !== undefined}
          aria-describedby="race-typing-status"
          className="h-16 w-full rounded-bouton border border-voile bg-abysse px-4 font-mono text-xl text-ecume focus-visible:border-moi aria-invalid:border-2 aria-invalid:border-erreur disabled:bg-sillage"
        />
        <p id="race-typing-status" role="status" className={`min-h-6 text-sm ${expected !== undefined ? "text-erreur" : "text-brume"}`}>
          {expected !== undefined && <span aria-hidden="true">⚠ </span>}
          {message}
        </p>
        {block === "observing" && reveal !== undefined && (
          <button type="button" onClick={() => onTakeControl(reveal.raceId)} className={`${secondaryButton} self-start`}>
            {t.takeControl}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * The text with what is typed (design `.course-*`): correct graphemes underlined, wrong ones on
 * a tinted background with a wavy underline, a blocked one boxed, the cursor as a bar. Never
 * colour alone (design rule 8). No animation near the text (rule 7). Memoised so that the
 * clock's ten renders a second skip it; a new typing state (a key, an answer, a broadcast)
 * renders it again.
 */
const RaceText = memo(function RaceText({
  target,
  typing,
  label,
  language,
  overlay,
}: {
  readonly target: readonly string[];
  readonly typing: RaceClientState["typing"];
  readonly label: string;
  readonly language: Locale;
  /** The countdown, over the faded text; the card keeps one height before and after. */
  readonly overlay?: ReactNode;
}) {
  const typed = typing?.typed.length ?? 0;
  return (
    <div className={`${card} relative min-h-60 p-5`}>
      <p className={`${monoLabel} mb-2`}>{label}</p>
      <p lang={language} className={`course-texte break-words ${overlay === undefined ? "" : "opacity-40"}`}>
        {target.map((grapheme, index) => {
          const mark = typing?.marks[index];
          const blocked = typing?.pendingError === true && index === typed;
          const className =
            index < typed ? (mark === "wrong" ? "course-erreur" : "course-juste") : blocked ? "course-bloque course-curseur" : index === typed && typing !== undefined ? "course-curseur" : "";
          return (
            // Graphemes never move: the same text, re-rendered in place.
            <span key={index} className={className}>
              {grapheme}
            </span>
          );
        })}
      </p>
    </div>
  );
});

function Track({ state, t, locale }: { readonly state: RaceClientState; readonly t: Dictionary["races"]; readonly locale: Locale }) {
  const names = new Map(state.entrants.map((entrant) => [entrant.entrantId, entrant.displayName]));
  return (
    <section aria-labelledby="track-heading" className={`${card} flex flex-col gap-4 self-start`}>
      <h2 id="track-heading" className="font-display text-2xl font-extrabold uppercase">
        {t.trackHeading}
      </h2>
      <ul className="flex flex-col gap-3">
        {(state.progress?.entrants ?? []).map((entrant) => {
          const self = entrant.entrantId === state.selfEntrantId;
          return (
            <li key={entrant.entrantId} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className={`font-semibold ${self ? "text-moi" : ""}`}>
                  {names.get(entrant.entrantId)}
                  {self ? <span className="font-normal"> ({t.you})</span> : null}
                </span>
                <span className="font-mono text-sm text-brume">
                  {formatProgress(entrant.position, entrant.length, locale)} · {formatWpm(entrant.netWpm, locale)} {t.wpm}
                </span>
              </div>
              <progress
                aria-label={names.get(entrant.entrantId)}
                value={entrant.position}
                max={entrant.length}
                className={`h-2 w-full appearance-none overflow-hidden rounded-full bg-sillage forced-colors:appearance-auto [&::-moz-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-sillage [&::-webkit-progress-value]:rounded-full ${
                  self ? "[&::-moz-progress-bar]:bg-moi [&::-webkit-progress-value]:bg-moi" : "[&::-moz-progress-bar]:bg-brume [&::-webkit-progress-value]:bg-brume"
                }`}
              />
              <span className="text-sm text-brume">{t.status[entrant.status]}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tile({ label, value, unit }: { readonly label: string; readonly value: string; readonly unit?: string }) {
  return (
    <div className={`${card} flex flex-col gap-1 p-4`}>
      <dt className={monoLabel}>{label}</dt>
      <dd className="font-display text-3xl font-extrabold sm:text-4xl">
        {value}
        {unit !== undefined && <span className="ml-1 text-base font-semibold text-brume">{unit}</span>}
      </dd>
    </div>
  );
}
