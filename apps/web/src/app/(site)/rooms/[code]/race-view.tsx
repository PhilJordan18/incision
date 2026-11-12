"use client";

import { containsLineBreak, toGraphemes } from "@incision/domain";
import { memo, type PointerEvent, type ReactNode, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { RaceStandings } from "@/components/races/race-standings";
import { RaceTrack } from "@/components/races/race-track";
import panels from "@/components/races/race-panels.module.css";
import { RaceBonuses } from "@/components/rooms/race-bonuses";
import { card, destructiveLink, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";
import { focusIsInQuestion, WarningQuestion } from "@/components/ui/warning-question";
import { useNarrowScreen } from "@/components/use-narrow-screen";
import { TypingLegend } from "@/components/races/typing-legend";
import { physicalKeyboardMessages } from "@/i18n/dictionaries/physical-keyboard";
import { raceScreenMessages } from "@/i18n/dictionaries/race-screen";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import { formatNumber } from "@/i18n/value-format";
import type { Locale } from "@/i18n/locale";
import type { BonusClient } from "@/races/bonus-client";
import { isBonusKeyIntent } from "@/races/bonus-key-intent";
import { fogStartsAt } from "@/races/fog";
import { formatAccuracy, formatClock, formatProgress, formatWpm } from "@/races/format";
import type { RaceClient, RaceClientState } from "@/races/race-client";

type RaceViewProps = {
  readonly race: RaceClient;
  readonly bonuses: BonusClient;
  readonly t: Dictionary["races"];
  readonly locale: Locale;
  readonly roomLabel: string;
  /** The race the room's snapshot names: a reveal of another (an older round) is not this race. */
  readonly expectedRaceId: string | undefined;
  /** Asks the server to move the input to this tab (state-machines §2). */
  readonly onTakeControl: (raceId: string) => void;
  /** « Je suis là » (D-17); resolves with whether the server took it. */
  readonly onPresent: (raceId: string) => Promise<boolean>;
  /** The confirmed abandon (COURSE-07); resolves with whether the server took it. */
  readonly onAbandon: (raceId: string) => Promise<boolean>;
  /** The page's connection is lost and being restored. */
  readonly reconnecting: boolean;
  /**
   * The host's « Quitter la salle »: under the field, with the other questions, so that nothing
   * above the text moves when its question opens (design rule 7). Kept in one place whether the
   * race has reached this tab or not, so that an open question stays open when it does.
   */
  readonly below?: ReactNode;
};

const TYPING_INPUT_ID = "race-typing";
const TYPING_STATUS_ID = "race-typing-status";
const TYPING_HINT_ID = "race-typing-hint";

/** Back to typing when the field takes keys, otherwise to `fallback` (WCAG 2.4.3). */
export function focusTyping(fallback?: HTMLElement | null): void {
  const field = document.getElementById(TYPING_INPUT_ID);
  if (field instanceof HTMLInputElement && !field.disabled) {
    field.focus();
  } else {
    fallback?.focus();
  }
}

/** The line under the text that says what happens: the status, or the hint while it is empty. */
function typingLine(): HTMLElement | null {
  const status = document.getElementById(TYPING_STATUS_ID);
  return status?.textContent === "" ? document.getElementById(TYPING_HINT_ID) ?? status : status;
}

/**
 * The race in a room (screens 07 and 08, first path): the 3-2-1 countdown on the server's
 * clock, then the text, typed straight into, and everyone's progress: the standings, the track
 * and the bonuses side by side under it. What is typed shows at once (the engine's
 * prediction); progress, measures and results come from the server.
 */
export function RaceView({ race, bonuses, t, locale, roomLabel, expectedRaceId, onTakeControl, onPresent, onAbandon, reconnecting, below }: RaceViewProps) {
  const state = useSyncExternalStore(race.subscribe, race.getState, race.getState);
  const bonusState = useSyncExternalStore(bonuses.subscribe, bonuses.getState, bonuses.getState);
  const now = useServerClock(race, state);
  const narrow = useNarrowScreen();
  const reveal = expectedRaceId === undefined || state.reveal?.raceId === expectedRaceId ? state.reveal : undefined;
  const waitedLong = useWaitedLong(reveal === undefined);
  if (reveal === undefined) {
    // The room counts down or races, but no race reached this tab: it runs elsewhere (two
    // processes overlapping) or its process stopped; the room recovers it once its lease ends.
    return (
      <RaceLayout
        main={
          <p role="status" className="text-embrun">
            {waitedLong ? t.elsewhere : t.preparing}
          </p>
        }
        below={below}
      />
    );
  }
  const phase = state.progress?.phase ?? (now < reveal.startsAt ? "countdown" : "racing");
  const counting = phase === "countdown" && now < reveal.startsAt;
  const selfProgress = state.progress?.entrants.find((entrant) => entrant.entrantId === state.selfEntrantId);
  const typedCount = state.typing?.typed.length ?? selfProgress?.position ?? 0;
  const length = state.typing?.target.length ?? reveal.text.length;
  const remaining = reveal.timeLimit === null ? undefined : reveal.timeLimit - Math.max(0, now - reveal.startsAt);
  const seconds = Math.max(1, Math.ceil((reveal.startsAt - now) / 1_000));
  // Over the faded text (screen 07), so that nothing moves when typing opens.
  const countdown = counting ? <Countdown seconds={seconds} t={t} locale={locale} /> : undefined;
  // One speed for "me", the broadcast's, as on the track; accuracy from the server's measures.
  const speed = selfProgress?.netWpm ?? state.measures?.netWpm ?? 0;
  const typedAnything = (state.typing?.totalInserts ?? 0) > 0;
  // Racing until the server says otherwise (the snapshot, or the broadcast before it arrives).
  const selfRacing = state.selfEntrantId !== null && (state.typing?.status ?? selfProgress?.status ?? "racing") === "racing";
  const inactive = selfRacing && selfProgress?.inactive === true;
  // A third panel only in a race with bonuses (Arcade); otherwise the track takes its room.
  const withBonuses = bonusState.self?.enabled === true || bonusState.announcements.length > 0;
  return (
    <RaceLayout
      top={
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
          <p className={`${monoLabel} flex flex-wrap gap-x-4 gap-y-1`}>
            <span>
              <span aria-hidden="true">[.</span>
              {roomLabel}
              <span aria-hidden="true">]</span>
            </span>
            {reveal.timeLimit !== null && (
              <span>
                <span aria-hidden="true">[.</span>
                {format(t.timeLimit, { minutes: formatNumber(Math.round(reveal.timeLimit / 60_000), locale) })}
                <span aria-hidden="true">]</span>
              </span>
            )}
          </p>

          {/* One live region from the reveal on: 3, 2, 1, then the start, announced once each. */}
          <p aria-live="assertive" aria-atomic="true" className="sr-only">
            {counting ? formatNumber(seconds, locale) : t.countdownGo}
          </p>
          {/* The compact indicators, beside the labels: the text below keeps its height. */}
          <dl className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Tile label={t.tiles.time} value={remaining === undefined ? "—" : formatClock(counting ? reveal.timeLimit ?? 0 : remaining)} />
            {state.selfEntrantId !== null && (
              <>
                <Tile label={t.tiles.speed} value={formatWpm(speed, locale)} unit={t.wpm} />
                <Tile label={t.tiles.accuracy} value={typedAnything ? formatAccuracy(state.measures?.accuracy ?? 0, locale) : "—"} />
                <Tile label={t.tiles.progress} value={formatProgress(typedCount, length, locale)} />
              </>
            )}
          </dl>
        </div>
      }
      main={
        <>
          {narrow ? (
            <section aria-labelledby="keyboard-guidance-heading" className={`${card} flex flex-col gap-3 p-5`}>
              <h2 id="keyboard-guidance-heading" className="font-display text-2xl font-extrabold uppercase">
                {physicalKeyboardMessages[locale].heading}
              </h2>
              <p id={TYPING_STATUS_ID} tabIndex={-1} role="status" className="text-embrun focus:outline-2 focus:outline-offset-4 focus:outline-ecume">
                {(state.typing?.status ?? selfProgress?.status) === "abandoned"
                  ? t.abandoned[state.abandonReason ?? "voluntary"]
                  : physicalKeyboardMessages[locale].description}
              </p>
            </section>
          ) : (
            <>
              {state.selfEntrantId === null && <p className="text-embrun">{t.spectating}</p>}
              <RaceSheet
                label={t.textLabel}
                overlay={countdown}
                // A press on the text goes back to « Ta frappe »: the text is not selected.
                onPointerDown={state.selfEntrantId === null ? undefined : (event) => {
                  const field = document.getElementById(TYPING_INPUT_ID);
                  if (!(field instanceof HTMLInputElement) || field.disabled || event.button !== 0) {
                    return;
                  }
                  event.preventDefault();
                  field.focus();
                }}
              >
                <RaceText
                  target={state.typing?.target ?? reveal.text}
                  typing={state.selfEntrantId === null ? undefined : state.typing}
                  fog={bonusState.fogVisible && (state.typing === undefined || state.typing.status === "racing")}
                  showFault={!counting && phase === "racing" && (state.typing === undefined || state.typing.status === "racing")}
                  label={t.textLabel}
                  language={state.language ?? locale}
                  faded={countdown !== undefined}
                />
              </RaceSheet>
            </>
          )}
        </>
      }
      pad={
        <>
          {!narrow && state.selfEntrantId !== null && (
            <TypingPad
              race={race}
              bonuses={bonuses}
              state={state}
              t={t}
              canType={!counting && phase === "racing"}
              onTakeControl={onTakeControl}
              locale={locale}
              inactive={inactive}
            />
          )}
          {/* Under the pad, in the flow: never over the text, nothing above it moves (design rule 7). */}
          {inactive && <StillThere t={t} locale={locale} canReturn={!narrow && state.control === "controlling"} onPresent={() => onPresent(reveal.raceId)} />}
        </>
      }
      after={
        <>
          {/* D-06: a lost connection keeps the place 30 s, from the server's detection. */}
          {selfRacing && reconnecting && (
            <p role="status" className={`${card} border-or text-embrun`}>
              <span aria-hidden="true">⚠ </span>
              {t.raceReconnect}
            </p>
          )}
          {state.confirming && (
            <p role="status" className={`${card} border-or text-embrun`}>
              <span aria-hidden="true">… </span>
              {t.confirming}
            </p>
          )}
          {/* Under the panels: its question opens there, far from the text (design rule 7). */}
          {selfRacing && phase !== "ended" && phase !== "interrupted" && (
            <AbandonControl key={reveal.raceId} t={t} onAbandon={() => onAbandon(reveal.raceId)} />
          )}
        </>
      }
      below={below}
      standings={<RaceStandings entrants={state.entrants} progress={state.progress} selfId={state.selfEntrantId} t={t} locale={locale} />}
      track={<RaceTrack entrants={state.entrants} progress={state.progress} selfId={state.selfEntrantId} t={t} locale={locale} />}
      bonuses={withBonuses ? <RaceBonuses state={bonusState} race={state} t={t.bonuses} locale={locale} /> : undefined}
    />
  );
}

/**
 * The race's page (Philippe's drawing, #51): the labels and compact indicators, the text over the
 * full width, then one row with the standings on the left, the track in the middle and the bonuses
 * on the right, then « Ta frappe », then the player's other actions and `below`. From 1024 px the
 * row's height follows the window's, so that the text, the track and the pad fit on one screen.
 * Under 1024 px the track runs horizontally over the full width, the standings and the bonuses share
 * the row under it; on a phone the bonuses come before the long standings. Without bonuses (not
 * Arcade), the standings sit beside a wider track, with no empty column. One component in every
 * state, and the pad always in the same place in it: a refresh of the panels never remounts it.
 */
function RaceLayout({ top, main, pad, after, below, standings, track, bonuses }: {
  readonly top?: ReactNode;
  readonly main: ReactNode;
  /** « Ta frappe » and what answers it (D-17), under the panels. */
  readonly pad?: ReactNode;
  /** The player's own actions, under the pad (giving up). */
  readonly after?: ReactNode;
  readonly below?: ReactNode;
  readonly standings?: ReactNode;
  readonly track?: ReactNode;
  readonly bonuses?: ReactNode;
}) {
  return (
    <div
      data-race-view=""
      // Escape from the text or a panel goes back to « Ta frappe » (when it takes keys).
      onKeyDown={(event) => {
        if (event.key === "Escape" && event.target instanceof Element && event.target.closest("[data-race-sheet], [data-race-row]") !== null) {
          focusTyping();
        }
      }}
      className="flex flex-col gap-4"
    >
      {top}
      <div className="flex min-w-0 flex-col gap-3">{main}</div>
      {track && (
        bonuses !== undefined ? (
          <div data-race-row="" className={`grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] ${ROW_HEIGHT}`}>
            <div className="order-3 min-w-0 sm:order-2 lg:order-1 lg:min-h-0">{standings}</div>
            <div className="order-1 min-w-0 sm:col-span-2 lg:order-2 lg:col-span-1 lg:min-h-0">{track}</div>
            <div className="order-2 min-w-0 sm:order-3 lg:order-3 lg:min-h-0">{bonuses}</div>
          </div>
        ) : (
          // No bonuses (not Arcade): no empty column; the standings beside a wider track.
          <div data-race-row="" className={`grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] ${ROW_HEIGHT}`}>
            <div className="order-2 min-w-0 lg:order-1 lg:min-h-0">{standings}</div>
            <div className="order-1 min-w-0 lg:order-2 lg:min-h-0">{track}</div>
          </div>
        )
      )}
      {pad}
      {after}
      {below && <div className="flex min-w-0 flex-col gap-5">{below}</div>}
    </div>
  );
}

/**
 * The window's height shared between the text and the row (≥ 1024 px): what the page's header,
 * the labels and the pad leave (about 19 rem), 42 % to the text and 58 % to the row, within bounds
 * that keep three lines of text and a readable chart. Below the minimums the page scrolls rather
 * than shrinking anything.
 */
const SHEET_HEIGHT = "h-60 lg:h-[clamp(11rem,calc((100dvh-19rem)*0.42),15rem)]";
const ROW_HEIGHT = "lg:h-[clamp(14rem,calc((100dvh-19rem)*0.58),22rem)]";

/**
 * D-17: after 60 s without activity, the question and its answer, as a dialog under the text
 * (never over it, whatever the screen's height). Non-modal on purpose: a keystroke in the text answers as well as the
 * button (the server's rule), so the text keeps the focus if the player was typing there. Otherwise
 * the focus goes to the dialog's heading, never to the button: a key meant for the text never
 * answers by accident, and only an explicit press of « Je suis là » does. Escape goes back to the
 * text without answering. Opening it is not activity: only a keystroke or the button tell the
 * server, never the tab being open.
 */
function StillThere({ t, locale, canReturn, onPresent }: {
  readonly t: Dictionary["races"];
  readonly locale: Locale;
  /** This tab types in the text: Escape takes the player back to it. */
  readonly canReturn: boolean;
  readonly onPresent: () => Promise<boolean>;
}) {
  const [step, setStep] = useState<"idle" | "sending" | "failed">("idle");
  const heading = useRef<HTMLHeadingElement>(null);
  const text = raceScreenMessages[locale];
  useEffect(() => {
    const focused = document.activeElement;
    if (focused?.id !== TYPING_INPUT_ID && !focusIsInQuestion()) {
      heading.current?.focus();
    }
  }, []);
  const answer = async () => {
    // One answer at a time: it shares its window with the abandon.
    if (step === "sending") {
      return;
    }
    setStep("sending");
    const taken = await onPresent();
    setStep(taken ? "idle" : "failed");
    if (taken) {
      // The field when it takes keys, otherwise the line that says why (an observing tab).
      focusTyping(typingLine());
    }
  };
  return (
    <dialog
      open
      aria-labelledby="still-there-heading"
      aria-describedby="still-there-body"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          focusTyping(heading.current);
        }
      }}
      className={`${card} static m-0 flex w-full max-w-xl flex-col gap-3 border-2 border-or text-ecume`}
    >
      {/* Announced once when it opens, wherever the focus is. */}
      <div role="alert" className="flex flex-col gap-1">
        <p className={`${monoLabel} text-or`}>
          <span aria-hidden="true">⚠ </span>
          {text.presenceLabel}
        </p>
        <h2 id="still-there-heading" ref={heading} tabIndex={-1} className="font-display text-2xl font-extrabold uppercase outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-moi">
          {t.stillThere}
        </h2>
        <p id="still-there-body" className="text-embrun">{t.stillThereBody}</p>
      </div>
      <button type="button" onClick={() => void answer()} aria-disabled={step === "sending"} className={`${secondaryButton} self-start aria-disabled:cursor-progress`}>
        {t.present}
      </button>
      {canReturn && <p className="text-sm text-brume">{text.presenceBack}</p>}
      <p role="alert" className="min-h-5 text-sm text-erreur">
        {step === "failed" && (
          <>
            <span aria-hidden="true">⚠ </span>
            {t.presentFailed}
          </>
        )}
      </p>
    </dialog>
  );
}

/**
 * COURSE-07: giving up takes a confirmation in the page; the server then makes it terminal.
 * The question takes the focus, "Keep racing" first; keeping racing (the button or Escape) gives
 * the focus back to the field. Once given up, the focus goes to the field's status line, which
 * says so; a refusal brings it back to the button. Keeping racing is the button, giving up the red
 * link (screen 12's destructive action).
 */
function AbandonControl({ t, onAbandon }: { readonly t: Dictionary["races"]; readonly onAbandon: () => Promise<boolean> }) {
  const [step, setStep] = useState<"idle" | "confirming" | "sending" | "failed">("idle");
  const question = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (step === "confirming") {
      question.current?.focus();
    } else if (step === "failed") {
      opener.current?.focus();
    }
  }, [step]);
  const keepRacing = () => {
    setStep("idle");
    // After the question is gone, where the player was typing.
    setTimeout(() => focusTyping(opener.current), 0);
  };
  const confirm = async () => {
    if (step === "sending") {
      return;
    }
    setStep("sending");
    if (await onAbandon()) {
      typingLine()?.focus();
    } else {
      setStep("failed");
    }
  };
  if (step === "idle" || step === "failed") {
    return (
      <div className="flex flex-col gap-1">
        <button ref={opener} type="button" onClick={() => setStep("confirming")} className={`${discreetButton} self-start`}>
          {t.abandon}
        </button>
        <p role="alert" className="min-h-5 text-sm text-erreur">
          {step === "failed" && (
            <>
              <span aria-hidden="true">⚠ </span>
              {t.abandonFailed}
            </>
          )}
        </p>
      </div>
    );
  }
  const sending = step === "sending";
  return (
    <WarningQuestion
      id="abandon-question"
      headingRef={question}
      warning={t.abandonWarning}
      question={t.abandonQuestion}
      onEscape={() => {
        if (!sending) {
          keepRacing();
        }
      }}
    >
      <p className="text-embrun">{t.abandonBody}</p>
      <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
        <button type="button" onClick={keepRacing} disabled={sending} className={secondaryButton}>
          {t.abandonCancel}
        </button>
        <button type="button" onClick={() => void confirm()} aria-disabled={sending} className={`${destructiveLink} aria-disabled:cursor-progress aria-disabled:opacity-80`}>
          {sending ? t.abandoning : t.abandonConfirm}
        </button>
      </div>
    </WarningQuestion>
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
function Countdown({ seconds, t, locale }: { readonly seconds: number; readonly t: Dictionary["races"]; readonly locale: Locale }) {
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
        {formatNumber(seconds, locale)}
      </p>
      <p className="font-serif text-2xl italic">{t.countdownMood}</p>
    </div>
  );
}

/**
 * « Ta frappe » (screen 08, Philippe's drawing): the one field that takes the keys, under the
 * panels. The text above shows the progress; nothing is typed into it. Native handlers: an input
 * method composes in the field, Backspace deletes, Enter only activates a bonus (D-16), pasting
 * and dropping are refused. It stays mounted while the race's panels refresh, and the focus stays
 * in it: only the player's own click elsewhere moves it.
 */
function TypingPad({
  race,
  bonuses,
  state,
  t,
  canType,
  onTakeControl,
  locale,
  inactive = false,
}: {
  readonly race: RaceClient;
  readonly bonuses: BonusClient;
  readonly state: RaceClientState;
  readonly t: Dictionary["races"];
  readonly canType: boolean;
  readonly onTakeControl: (raceId: string) => void;
  readonly locale: Locale;
  /** D-17's question is open: said beside the pad too, where the eyes are. */
  readonly inactive?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const screen = raceScreenMessages[locale];
  const { typing, block, reveal } = state;
  const enabled = canType && block === undefined && (typing === undefined || typing.status === "racing");
  const ended = typing === undefined || typing.status === "racing" ? undefined : typing.status;

  // The pad takes the focus when typing opens: at "Go", or when this tab takes the input. Never
  // from a question being answered (giving up, the host's leave): a key meant for it would type.
  useEffect(() => {
    if (enabled && !focusIsInQuestion()) {
      // Without scrolling: the page was laid out so that the text, the track and the pad show together.
      input.current?.focus({ preventScroll: true });
      if (input.current && !inView(input.current)) {
        input.current.scrollIntoView({ block: "nearest" });
      }
    }
  }, [enabled]);

  // Native `beforeinput`, which React does not expose with its input type.
  useEffect(() => {
    const field = input.current;
    if (field === null) {
      return;
    }
    let composing = false;
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
      composing = false;
      insert(event.data);
      field.value = "";
    };
    const onCompositionStart = () => { composing = true; };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Backspace") {
        // An input method edits its own composition (a dead key, a candidate): not the race's text.
        if (event.isComposing || composing) return;
        event.preventDefault();
        race.type({ type: "deleteBackward" });
      } else if (event.key === "Enter") {
        // Leave IME confirmation alone; it is not a bonus or a typing event (D-16).
        if (!event.isComposing && !composing && event.keyCode !== 229) event.preventDefault();
        const current = race.getState();
        if (isBonusKeyIntent({
          key: event.key, repeat: event.repeat, isComposing: event.isComposing || composing,
          keyCode: event.keyCode, modified: event.altKey || event.ctrlKey || event.metaKey || event.shiftKey,
          context: {
            typingFieldFocused: document.activeElement === field && !field.disabled,
            dialogOpen: document.querySelector('[data-warning-question]') !== null,
            controlling: current.control === "controlling" && current.block === undefined,
            racing: current.progress?.phase === "racing" && current.typing?.status === "racing" && !current.confirming,
            enabled: bonuses.getState().self?.enabled === true,
          },
        })) bonuses.activate();
      }
    };
    const refuse = (event: Event) => event.preventDefault();
    field.addEventListener("beforeinput", onBeforeInput);
    field.addEventListener("compositionstart", onCompositionStart);
    field.addEventListener("compositionend", onCompositionEnd);
    field.addEventListener("keydown", onKeyDown);
    field.addEventListener("paste", refuse);
    field.addEventListener("drop", refuse);
    return () => {
      field.removeEventListener("beforeinput", onBeforeInput);
      field.removeEventListener("compositionstart", onCompositionStart);
      field.removeEventListener("compositionend", onCompositionEnd);
      field.removeEventListener("keydown", onKeyDown);
      field.removeEventListener("paste", refuse);
      field.removeEventListener("drop", refuse);
    };
  }, [race, bonuses]);

  // A fault to correct only while this player types here: once the race is over for them (given
  // up, finished, time up, interrupted) or the field is blocked, the line says why, and neither the
  // field nor the text is in error. An observing tab still sees the fault in the text, as it is.
  const expected = enabled && typing?.pendingError === true ? typing.target[typing.typed.length] : undefined;
  const message =
    block === "observing"
      ? t.observing
      : block === "suspended"
        ? t.suspended
        : block === "reload"
          ? t.reload
          : ended === "abandoned"
            ? t.abandoned[state.abandonReason ?? "voluntary"]
            : ended !== undefined
              ? t[ended]
              : expected !== undefined
                ? expected === " "
                  ? t.blockedSpace
                  : format(t.blocked, { expected })
                : undefined;
  // How to type, beside the live line rather than in it: tabbing away and back is not news.
  const hint = message !== undefined ? undefined : inactive ? screen.presenceHint : focused ? screen.typingHint : enabled ? screen.focusHint : t.typingHint;
  return (
    // A press anywhere on the pad but its controls goes back to « Ta frappe » (#51), like the text.
    <div data-typing-pad="" className={`${panels.pad} flex flex-col gap-2`} onPointerDown={(event) => {
      const field = input.current;
      if (field === null || field.disabled || event.button !== 0 || (event.target as Element).closest("input, button, a")) return;
      event.preventDefault();
      field.focus();
    }}>
      <div className="grid items-center gap-x-5 gap-y-2 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <div className="flex items-center gap-4">
          <label htmlFor={TYPING_INPUT_ID} className={`${monoLabel} shrink-0 text-ecume`}>
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
            aria-describedby={`${TYPING_STATUS_ID} ${TYPING_HINT_ID}`}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            className={panels.field}
          />
        </div>
        <div className="min-h-10 text-sm">
          <p id={TYPING_STATUS_ID} role="status" tabIndex={-1} className={`outline-none ${expected !== undefined ? "text-erreur" : "text-brume"}`}>
            {expected !== undefined && <span aria-hidden="true">⚠ </span>}
            {message}
          </p>
          <p id={TYPING_HINT_ID} tabIndex={-1} className={`outline-none ${inactive && message === undefined ? "text-or" : "text-brume"}`}>
            {inactive && message === undefined && <span aria-hidden="true">⚠ </span>}
            {hint}
          </p>
        </div>
      </div>
      {block === "observing" && reveal !== undefined && (
        <button type="button" onClick={() => onTakeControl(reveal.raceId)} className={`${secondaryButton} self-start`}>
          {t.takeControl}
        </button>
      )}
      <TypingLegend mode={reveal?.errorMode} locale={locale} />
    </div>
  );
}

function inView(element: HTMLElement): boolean {
  const box = element.getBoundingClientRect();
  return box.top >= 0 && box.bottom <= window.innerHeight;
}

/**
 * The text's sheet (design `.course-*`, framed as a chart): its label and the text, which shows
 * the progress. The sheet keeps one height in every state, before and after the countdown, so
 * nothing near the text moves (design rule 7).
 */
function RaceSheet({ label, overlay, onPointerDown, children }: {
  readonly label: string;
  /** The countdown, over the faded text. */
  readonly overlay?: ReactNode;
  readonly onPointerDown?: (event: PointerEvent<HTMLDivElement>) => void;
  readonly children: ReactNode;
}) {
  return (
    <div data-race-sheet="" onPointerDown={onPointerDown} className={`${panels.sheet} flex flex-col ${SHEET_HEIGHT}`}>
      <p aria-hidden="true" className={`${monoLabel} mb-1`}>
        {label}
      </p>
      {children}
      {overlay}
    </div>
  );
}

/**
 * The text with what is typed (design `.course-*`): correct graphemes underlined, wrong ones on
 * a tinted background with a wavy underline, a blocked one boxed, the cursor as a bar. Never
 * colour alone (design rule 8). No animation near the text (rule 7). Memoised so that the
 * clock's ten renders a second skip it; a new typing state (a key, an answer, a broadcast)
 * renders it again. A long text scrolls inside the sheet, following the cursor; the region is a
 * focus stop of its own to scroll it.
 */
const RaceText = memo(function RaceText({
  target,
  typing,
  showFault = true,
  fog = false,
  label,
  language,
  faded = false,
}: {
  readonly target: readonly string[];
  readonly typing: RaceClientState["typing"];
  /** The fault still to correct, boxed; not once the race is over for this player. */
  readonly showFault?: boolean;
  readonly fog?: boolean;
  readonly label: string;
  readonly language: Locale;
  /** Under the countdown. */
  readonly faded?: boolean;
}) {
  const typed = typing?.typed.length ?? 0;
  const hiddenFrom = fog ? fogStartsAt(target, typed) : target.length;
  const textArea = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // Long/extended targets scroll inside a fixed sheet, never moving the page.
    const area = textArea.current;
    const cursor = area?.querySelector<HTMLElement>(".course-curseur");
    if (!area || !cursor) return;
    const frame = area.getBoundingClientRect();
    const caret = cursor.getBoundingClientRect();
    if (caret.bottom > frame.bottom) area.scrollTop += caret.bottom - frame.bottom;
    else if (caret.top < frame.top) area.scrollTop -= frame.top - caret.top;
  }, [typed, target]);
  return (
    <p
      ref={textArea}
      role="region"
      aria-label={label}
      tabIndex={0}
      lang={language}
      className={`course-texte relative min-h-0 grow overflow-y-auto break-words rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-moi ${faded ? "opacity-40" : ""}`}
    >
      {target.map((grapheme, index) => {
        const mark = typing?.marks[index];
        const blocked = showFault && typing?.pendingError === true && index === typed;
        const className =
          index < typed ? (mark === "wrong" ? "course-erreur" : "course-juste") : blocked ? "course-bloque course-curseur" : index === typed && typing !== undefined ? "course-curseur" : "";
        return (
          // Graphemes never move: the same text, re-rendered in place.
          <span key={index} aria-hidden={index >= hiddenFrom ? true : undefined} className={`${className} ${index >= hiddenFrom ? "invisible" : ""}`}>
            {grapheme}
          </span>
        );
      })}
    </p>
  );
});

/** A compact indicator (#51): its label beside its value, so that the text below keeps its room. */
function Tile({ label, value, unit }: { readonly label: string; readonly value: string; readonly unit?: string }) {
  return (
    <div className="flex items-baseline gap-2 rounded-carte border border-houle bg-nuit px-3 py-1">
      <dt className={monoLabel}>{label}</dt>
      <dd className="font-display text-2xl font-extrabold tabular-nums">
        {value}
        {unit !== undefined && <span className="ml-1 text-base font-semibold text-brume">{unit}</span>}
      </dd>
    </div>
  );
}
