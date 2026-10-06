"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { LeaveRoomForm } from "@/components/rooms/leave-room-form";
import { PageHeading } from "@/components/ui/page-heading";
import { StatePanel } from "@/components/ui/state-panel";
import { card, discreetButton, monoLabel, secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import {
  type PublicRoomSnapshot,
  ROOM_SNAPSHOT_EVENT,
  ROOM_WATCH_EVENT,
  roomSnapshotSchema,
  roomWatchAckSchema,
  WATCH_LIMIT,
} from "@/rooms/protocol";
import { RoomCode } from "./room-code";

type Connection = "connecting" | "live" | "reconnecting";
/** Why the waiting room is no longer shown, when it is not. */
type Ending = "notMember" | "signedOut";
type CopyFeedback = "copied" | "failed" | undefined;

type RoomViewProps = {
  readonly initial: PublicRoomSnapshot;
  readonly selfMemberId: string;
  readonly t: Dictionary["rooms"];
};

/** Delays before asking for the room again after a refused or lost watch. */
const RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000];
const COPY_FEEDBACK_MS = 4_000;
const STATE_HEADING_ID = "room-state-heading";
const ROOM_HEADING_ID = "room-heading";

/**
 * Waiting room (screen 06, checkpoint subset): the code to share and the crew, kept live
 * over Socket.IO. The server renders the first snapshot; the socket keeps the newest one
 * (highest revision; presence updates keep the revision).
 */
export function RoomView({ initial, selfMemberId, t }: RoomViewProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [ending, setEnding] = useState<Ending | undefined>(undefined);
  const [copy, setCopy] = useState<CopyFeedback>(undefined);
  const router = useRouter();
  /** Asks for the room at once (the reconnection card's button). */
  const retryNowRef = useRef<() => void>(() => undefined);
  // While this page leaves the room, the departure snapshot (without this member) must not
  // replace the view before the redirect lands; it is kept in case the departure fails.
  const leavingRef = useRef(false);
  const heldRef = useRef<PublicRoomSnapshot | undefined>(undefined);

  useEffect(() => {
    const socket = io({ reconnectionDelayMax: 5_000 });
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    // Answers to a watch sent before the last (re)connection are ignored.
    let generation = 0;
    // The page stays under the server's limit (one watch at a time, a few per window) so
    // that impatient retries are never mistaken for a flood.
    let inFlight = false;
    let sentAt: number[] = [];
    const keepNewest = (next: PublicRoomSnapshot) => {
      if (leavingRef.current) {
        heldRef.current = next.revision >= (heldRef.current?.revision ?? -1) ? next : heldRef.current;
        return;
      }
      setSnapshot((current) => (next.revision >= current.revision ? next : current));
    };

    function retryLater(): void {
      setConnection("reconnecting");
      clearTimeout(retry);
      retry = setTimeout(watch, RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
      attempt += 1;
    }

    function watch(): void {
      if (!socket.connected || inFlight) {
        return;
      }
      const now = Date.now();
      sentAt = sentAt.filter((time) => now - time < WATCH_LIMIT.windowMs);
      const oldest = sentAt[0];
      if (oldest !== undefined && sentAt.length >= WATCH_LIMIT.maxWatches - 1) {
        clearTimeout(retry);
        retry = setTimeout(watch, WATCH_LIMIT.windowMs - (now - oldest));
        return;
      }
      sentAt.push(now);
      inFlight = true;
      const sent = generation;
      const current = (handle: () => void) => () => {
        if (sent === generation) {
          handle();
        }
      };
      socket
        .timeout(10_000)
        .emitWithAck(ROOM_WATCH_EVENT, { code: initial.code })
        .then((answer: unknown) => {
          if (sent !== generation) {
            return;
          }
          inFlight = false;
          const ack = roomWatchAckSchema.safeParse(answer);
          if (!ack.success) {
            retryLater();
          } else if (ack.data.ok) {
            attempt = 0;
            keepNewest(ack.data.snapshot);
            setConnection("live");
          } else if (ack.data.error === "NOT_A_MEMBER") {
            // Left from another tab, or the room closed while this page was away: the
            // server's page says which (closed panel or join panel).
            router.refresh();
          } else if (ack.data.error === "UNAUTHORIZED") {
            setEnding("signedOut");
          } else {
            retryLater();
          }
        })
        .catch(
          current(() => {
            inFlight = false;
            retryLater();
          }),
        );
    }

    retryNowRef.current = () => {
      clearTimeout(retry);
      attempt = 0;
      if (socket.connected) {
        watch();
      } else {
        // Skips the wait between the client's own reconnection attempts.
        socket.disconnect().connect();
      }
    };

    socket.on("connect", () => {
      // A new connection is a new socket on the server, with its own budget.
      generation += 1;
      inFlight = false;
      sentAt = [];
      clearTimeout(retry);
      watch();
    });
    socket.on("disconnect", (reason) => {
      generation += 1;
      inFlight = false;
      clearTimeout(retry);
      // The server cuts a socket whose session ended (sign-out, revocation, expiry), and
      // one that flooded it; neither is retried by the client.
      if (reason === "io server disconnect") {
        setEnding("signedOut");
      } else {
        setConnection("reconnecting");
      }
    });
    socket.on("connect_error", () => {
      // A refused handshake (session no longer valid) is not retried by the client.
      if (!socket.active) {
        setEnding("signedOut");
      }
    });
    socket.on(ROOM_SNAPSHOT_EVENT, (payload: unknown) => {
      const next = roomSnapshotSchema.safeParse(payload);
      if (next.success) {
        keepNewest(next.data);
      }
    });
    return () => {
      clearTimeout(retry);
      socket.close();
    };
  }, [initial.code, router]);

  const onLeaving = useCallback(() => {
    leavingRef.current = true;
  }, []);
  const onLeaveFailed = useCallback(() => {
    leavingRef.current = false;
    const held = heldRef.current;
    heldRef.current = undefined;
    if (held !== undefined) {
      setSnapshot((current) => (held.revision >= current.revision ? held : current));
    }
  }, []);

  useEffect(() => {
    if (copy === undefined) {
      return;
    }
    const timer = setTimeout(() => setCopy(undefined), COPY_FEEDBACK_MS);
    return () => clearTimeout(timer);
  }, [copy]);

  const self = snapshot.members.find((member) => member.memberId === selfMemberId);
  const closed = snapshot.phase === "closed";
  const shownEnding: Ending | "closed" | undefined = closed ? "closed" : (ending ?? (self === undefined ? "notMember" : undefined));

  useEffect(() => {
    if (shownEnding !== undefined) {
      document.getElementById(STATE_HEADING_ID)?.focus();
    }
  }, [shownEnding]);

  // When the reconnection card (and maybe its focused button) goes away, focus would fall
  // back to the page: put it on the room's heading instead.
  const wasReconnecting = useRef(false);
  useEffect(() => {
    if (connection === "reconnecting") {
      wasReconnecting.current = true;
    } else if (connection === "live" && wasReconnecting.current) {
      wasReconnecting.current = false;
      if (document.activeElement === null || document.activeElement === document.body) {
        document.getElementById(ROOM_HEADING_ID)?.focus();
      }
    }
  }, [connection]);

  async function copyCode(): Promise<void> {
    try {
      await navigator.clipboard.writeText(snapshot.code);
      setCopy("copied");
    } catch {
      setCopy("failed");
    }
  }

  if (shownEnding !== undefined || self === undefined) {
    return <RoomEnding ending={shownEnding ?? "notMember"} code={snapshot.code} t={t} />;
  }

  const participants = snapshot.members.filter((member) => member.role === "participant").length;
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div className="flex flex-col gap-3">
          <p className={monoLabel}>
            <span aria-hidden="true">[.</span>
            {format(t.roomTitle, { code: snapshot.code })}
            <span aria-hidden="true">]</span>
          </p>
          <PageHeading bold={t.roomHeading} id={ROOM_HEADING_ID} />
        </div>
        <div className="flex max-w-xs flex-col gap-2">
          <LeaveRoomForm
            label={t.leave}
            pendingLabel={t.leaving}
            errors={t.changeErrors}
            describedBy={self.isHost ? "host-leave-note" : undefined}
            onLeaving={onLeaving}
            onFailed={onLeaveFailed}
          />
          {self.isHost && (
            <p id="host-leave-note" className="text-sm text-brume">
              {t.hostLeaveNote}
            </p>
          )}
        </div>
      </div>

      <p aria-live="polite" className={`${monoLabel} ${connection === "live" ? "text-juste" : "text-or"}`}>
        <span aria-hidden="true">[.</span>
        {t.connection[connection]}
        <span aria-hidden="true">]</span>
      </p>

      {connection === "reconnecting" && (
        <section aria-labelledby="reconnect-heading" className={`${card} flex max-w-xl flex-col gap-3 border-or`}>
          <p className={`${monoLabel} text-or`}>
            <span aria-hidden="true">⚠ </span>
            {t.reconnect.label}
          </p>
          <h2 id="reconnect-heading" className="font-display text-3xl font-extrabold uppercase">
            {t.reconnect.heading}
          </h2>
          <p className="text-embrun">{t.reconnect.body}</p>
          <button type="button" onClick={() => retryNowRef.current()} className={`${secondaryButton} self-start`}>
            {t.reconnect.retry}
          </button>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
        <section aria-labelledby="code-heading" className={`${card} flex flex-col gap-3 self-start lg:order-2`}>
          <h2 id="code-heading" className={monoLabel}>
            {t.codeLabel}
          </h2>
          <div className="flex items-center gap-3">
            <span className="grow">
              <RoomCode code={snapshot.code} />
            </span>
            <button
              type="button"
              onClick={() => void copyCode()}
              aria-label={t.copyCode}
              className="grid size-11 shrink-0 place-items-center rounded-bouton border border-houle text-embrun transition-colors duration-200 ease-incision hover:text-ecume"
            >
              <CopyIcon />
            </button>
          </div>
          <p role="status" className={`min-h-5 text-sm ${copy === "failed" ? "text-erreur" : "text-juste"}`}>
            {copy === "copied" ? `✓ ${t.codeCopied}` : copy === "failed" ? `⚠ ${t.copyFailed}` : ""}
          </p>
        </section>

        <section aria-labelledby="crew-heading" className={`${card} flex flex-col gap-4`}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="crew-heading" className="font-display text-3xl font-extrabold uppercase">
              {t.membersHeading}
            </h2>
            <p className="font-mono text-sm text-brume">{format(t.membersCount, { count: participants, capacity: snapshot.capacity })}</p>
          </div>
          <ul className="flex flex-col divide-y divide-sillage">
            {snapshot.members.map((member) => (
              <li key={member.memberId} className="flex flex-wrap items-center gap-3 py-3">
                <span aria-hidden="true" className={`size-2.5 rounded-full ${member.online ? "bg-juste" : "bg-voile"}`} />
                <span className="font-semibold">
                  {member.displayName}
                  {member.memberId === selfMemberId ? <span className="font-normal text-brume"> ({t.you})</span> : null}
                </span>
                {member.isHost && <span className="font-mono text-[10px] tracking-[0.2em] text-ligne uppercase">{t.host}</span>}
                <span className="text-sm text-brume">{t.roleNames[member.role]}</span>
                <span className="ml-auto text-sm text-brume">{member.online ? t.online : t.offline}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

/** What replaces the waiting room once it no longer applies (screen 15). */
function RoomEnding({ ending, code, t }: { readonly ending: Ending | "closed"; readonly code: string; readonly t: Dictionary["rooms"] }) {
  const home = (
    <Link href="/" className={discreetButton}>
      {t.backHome}
    </Link>
  );
  switch (ending) {
    case "closed":
      return (
        <StatePanel
          tone="neutral"
          label={format(t.roomTitle, { code })}
          heading={{ bold: t.closedHeadingBold, serif: t.closedHeadingSerif }}
          headingId={STATE_HEADING_ID}
          actions={
            <>
              <Link href="/rooms/new" className={secondaryButton}>
                {t.createRoom}
              </Link>
              {home}
            </>
          }
        >
          <p>{format(t.closed, { code })}</p>
        </StatePanel>
      );
    case "notMember":
      return (
        <StatePanel
          tone="warning"
          label={t.notMemberLabel}
          heading={{ bold: t.notMemberHeading }}
          headingId={STATE_HEADING_ID}
          actions={
            <>
              {/* The server shows the join panel while the room is open. */}
              <Link href={`/rooms/${code}`} className={secondaryButton}>
                {t.rejoin}
              </Link>
              {home}
            </>
          }
        >
          <p>{format(t.notMember, { code })}</p>
        </StatePanel>
      );
    case "signedOut":
      return (
        <StatePanel
          tone="warning"
          label={t.signedOutLabel}
          heading={{ bold: t.signedOutHeading }}
          headingId={STATE_HEADING_ID}
          actions={
            <>
              <Link href={`/sign-in?${new URLSearchParams({ callbackUrl: `/rooms/${code}` })}`} className={secondaryButton}>
                {t.signIn}
              </Link>
              {home}
            </>
          }
        >
          <p>{format(t.signedOut, { code })}</p>
        </StatePanel>
      );
  }
}

function CopyIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
