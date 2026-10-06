import { parseRoomCode } from "@incision/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeaveRoomForm } from "@/components/rooms/leave-room-form";
import { StatePanel } from "@/components/ui/state-panel";
import { discreetButton, secondaryButton } from "@/components/ui/styles";
import { format } from "@/i18n/format";
import { getRequestDictionary } from "@/i18n/server";
import { publicSnapshot } from "@/rooms/public-snapshot";
import { getAccountSession, requireAccountSession } from "@/server/auth/session";
import { JoinRoomForm } from "./join-room-form";
import { loadRoomPage } from "./load-room";
import { RoomView } from "./room-view";

export async function generateMetadata({ params }: PageProps<"/rooms/[code]">): Promise<Metadata> {
  const [{ t }, { code }, session] = await Promise.all([getRequestDictionary(), params, getAccountSession()]);
  const parsed = parseRoomCode(code);
  if (!parsed.ok || (session !== null && (await loadRoomPage(session.accountId, parsed.code)).kind === "unknown")) {
    return { title: t.notFound.title };
  }
  return { title: format(t.rooms.roomTitle, { code: parsed.code }) };
}

/**
 * A room's page (SALLE-01/02, JOIN-01). Members see the live waiting room; other signed-in
 * accounts can join an admitting room, or are offered to leave the room they are in
 * (SALLE-06). Nothing changes on a GET: joining and leaving are server actions.
 */
export default async function RoomPage({ params }: PageProps<"/rooms/[code]">) {
  const { code: raw } = await params;
  const parsed = parseRoomCode(raw);
  if (!parsed.ok) {
    notFound();
  }
  if (raw !== parsed.code) {
    redirect(`/rooms/${parsed.code}`);
  }
  const code = parsed.code;
  const { accountId } = await requireAccountSession(`/rooms/${code}`);
  const [{ t }, state] = await Promise.all([getRequestDictionary(), loadRoomPage(accountId, code)]);

  switch (state.kind) {
    case "unknown":
      return notFound();
    case "member":
      // Presence comes with the socket; the first render shows nobody online yet.
      return <RoomView initial={publicSnapshot(state.snapshot, new Set())} selfMemberId={state.memberId} t={t.rooms} />;
    case "notAdmitting": {
      const closed = state.phase === "closed";
      return (
        <StatePanel
          tone={closed ? "neutral" : "warning"}
          label={closed ? t.rooms.closedLabel : t.rooms.racingLabel}
          heading={
            closed
              ? { bold: t.rooms.closedHeadingBold, serif: t.rooms.closedHeadingSerif }
              : { bold: t.rooms.racingHeadingBold, serif: t.rooms.racingHeadingSerif }
          }
          actions={
            <>
              <Link href="/rooms/new" className={secondaryButton}>
                {t.rooms.createRoom}
              </Link>
              <Link href="/" className={discreetButton}>
                {t.rooms.backHome}
              </Link>
            </>
          }
        >
          <p>{format(closed ? t.rooms.closed : t.rooms.racing, { code })}</p>
        </StatePanel>
      );
    }
    case "inAnotherRoom":
      return (
        <StatePanel
          tone="warning"
          label={t.rooms.alreadyInRoomLabel}
          heading={{ bold: t.rooms.alreadyInRoomLabel }}
          actions={
            <>
              <Link href={`/rooms/${state.current.code}`} className={secondaryButton}>
                {t.rooms.goToMyRoom}
              </Link>
              <LeaveRoomForm
                label={format(t.rooms.leaveAndJoin, { code: state.current.code })}
                pendingLabel={t.rooms.leaving}
                errors={t.rooms.changeErrors}
                returnTo={`/rooms/${code}`}
                describedBy={state.current.isHost ? "host-leave-note" : undefined}
              />
            </>
          }
        >
          <p>{format(t.rooms.alreadyInRoom, { code: state.current.code })}</p>
          {state.current.isHost && (
            <p id="host-leave-note" className="mt-2 text-sm text-brume">
              {t.rooms.hostLeaveNote}
            </p>
          )}
        </StatePanel>
      );
    case "join":
      return <JoinRoomForm code={code} t={t} />;
  }
}
