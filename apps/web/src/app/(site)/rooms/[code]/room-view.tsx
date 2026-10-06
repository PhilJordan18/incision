"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { io } from "socket.io-client";
import { LeaveRoomForm } from "@/components/rooms/leave-room-form";
import { card, monoLabel, secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import {
  type PublicRoomSnapshot,
  ROOM_SNAPSHOT_EVENT,
  ROOM_WATCH_EVENT,
  roomSnapshotSchema,
  roomWatchAckSchema,
} from "@/rooms/protocol";

type Connection = "connecting" | "live" | "reconnecting" | "notMember";

type RoomViewProps = {
  readonly initial: PublicRoomSnapshot;
  readonly selfMemberId: string;
  readonly t: Dictionary["rooms"];
};

/**
 * Waiting room (screen 06, checkpoint subset): the code to share and the members, kept
 * live over Socket.IO. The server renders the first snapshot; the socket keeps the
 * newest one (highest revision; presence updates keep the revision).
 */
export function RoomView({ initial, selfMemberId, t }: RoomViewProps) {
  const [snapshot, setSnapshot] = useState(initial);
  const [connection, setConnection] = useState<Connection>("connecting");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const socket = io({ reconnectionDelayMax: 5_000 });
    const keepNewest = (next: PublicRoomSnapshot) =>
      setSnapshot((current) => (next.revision >= current.revision ? next : current));

    socket.on("connect", () => {
      void socket
        .timeout(10_000)
        .emitWithAck(ROOM_WATCH_EVENT, { code: initial.code })
        .then((answer: unknown) => {
          const ack = roomWatchAckSchema.safeParse(answer);
          if (!ack.success) {
            setConnection("reconnecting");
            return;
          }
          if (ack.data.ok) {
            keepNewest(ack.data.snapshot);
            setConnection("live");
          } else {
            setConnection(ack.data.error === "NOT_A_MEMBER" ? "notMember" : "reconnecting");
          }
        })
        .catch(() => setConnection("reconnecting"));
    });
    socket.on("disconnect", () => setConnection((current) => (current === "notMember" ? current : "reconnecting")));
    socket.on(ROOM_SNAPSHOT_EVENT, (payload: unknown) => {
      const next = roomSnapshotSchema.safeParse(payload);
      if (next.success) {
        keepNewest(next.data);
      }
    });
    return () => {
      socket.close();
    };
  }, [initial.code]);

  async function copyCode(): Promise<void> {
    await navigator.clipboard.writeText(snapshot.code);
    setCopied(true);
  }

  const self = snapshot.members.find((member) => member.memberId === selfMemberId);
  const participants = snapshot.members.filter((member) => member.role === "participant").length;

  if (snapshot.phase === "closed" || connection === "notMember" || self === undefined) {
    return (
      <section className={`${card} flex max-w-xl flex-col gap-4 border-or`}>
        <p className={`${monoLabel} text-or`}>
          <span aria-hidden="true">⚠ </span>
          {t.closedLabel}
        </p>
        <p role="alert">{snapshot.phase === "closed" ? t.closed : t.notMember}</p>
        <Link href="/" className={`${secondaryButton} self-start`}>
          {t.backHome}
        </Link>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="flex flex-col gap-3">
          <p className={monoLabel}>[.{t.roomLabel}]</p>
          <h1 className="font-display text-5xl leading-[0.9] font-black uppercase sm:text-[64px]">
            {t.roomHeadingBold} <span className="font-mono text-[0.6em] tracking-[0.2em]">{snapshot.code}</span>
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void copyCode()} className={secondaryButton}>
            {t.copyCode}
          </button>
          <p aria-live="polite" className="text-sm text-juste">
            {copied ? `✓ ${t.codeCopied}` : ""}
          </p>
        </div>
      </div>

      <p aria-live="polite" className={`${monoLabel} ${connection === "live" ? "text-juste" : "text-or"}`}>
        [.{t.connection[connection]}]
      </p>

      <section aria-labelledby="crew-heading" className={`${card} flex flex-col gap-4`}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="crew-heading" className="font-display text-3xl font-extrabold uppercase">
            {t.membersHeading}
          </h2>
          <p className="font-mono text-sm text-brume">
            {format(t.membersCount, { count: participants, capacity: snapshot.capacity })}
          </p>
        </div>
        <ul className="flex flex-col divide-y divide-sillage">
          {snapshot.members.map((member) => (
            <li key={member.memberId} className="flex flex-wrap items-center gap-3 py-3">
              <span
                aria-hidden="true"
                className={`size-2.5 rounded-full ${member.online ? "bg-juste" : "bg-voile"}`}
              />
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

      <div className="flex flex-col gap-2">
        {self.isHost && <p className="text-sm text-brume">{t.hostLeaveNote}</p>}
        <LeaveRoomForm label={t.leave} pendingLabel={t.leaving} />
      </div>
    </div>
  );
}
