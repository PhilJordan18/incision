import { findActiveMembership, findRoomByCode, readRoomSnapshot } from "@incision/database";
import { parseRoomCode } from "@incision/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LeaveRoomForm } from "@/components/rooms/leave-room-form";
import { StatePanel } from "@/components/ui/state-panel";
import { secondaryButton } from "@/components/ui/styles";
import { format } from "@/i18n/format";
import { getRequestDictionary } from "@/i18n/server";
import { publicSnapshot } from "@/rooms/public-snapshot";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { JoinRoomForm } from "./join-room-form";
import { RoomView } from "./room-view";

export async function generateMetadata({ params }: PageProps<"/rooms/[code]">): Promise<Metadata> {
  const [{ t }, { code }] = await Promise.all([getRequestDictionary(), params]);
  return { title: format(t.rooms.roomTitle, { code: code.toUpperCase() }) };
}

/**
 * A room's page (SALLE-01/02, JOIN-01). Members see the live waiting room; other signed-in
 * accounts can join it, or are offered to leave the room they are in (SALLE-06). Nothing
 * changes on a GET: joining and leaving are server actions.
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
  const { accountId } = await requireAccountSession(`/rooms/${parsed.code}`);
  const db = authDatabase();
  const [{ t }, current] = await Promise.all([getRequestDictionary(), findActiveMembership(db, accountId)]);

  if (current?.code === parsed.code) {
    const snapshot = await readRoomSnapshot(db, current.lobbyId);
    if (snapshot === undefined) {
      notFound();
    }
    // Presence comes with the socket; the first render shows nobody online yet.
    return <RoomView initial={publicSnapshot(snapshot, new Set())} selfMemberId={current.memberId} t={t.rooms} />;
  }

  const room = await findRoomByCode(db, parsed.code);
  if (room === undefined) {
    notFound();
  }
  if (current !== undefined) {
    return (
      <StatePanel
        tone="warning"
        label={t.rooms.alreadyInRoomLabel}
        heading={{ bold: t.rooms.joinHeadingBold, serif: parsed.code }}
        actions={
          <>
            <Link href={`/rooms/${current.code}`} className={secondaryButton}>
              {t.rooms.goToMyRoom}
            </Link>
            <LeaveRoomForm
              label={format(t.rooms.leaveAndJoin, { code: current.code })}
              pendingLabel={t.rooms.leaving}
              returnTo={`/rooms/${parsed.code}`}
            />
          </>
        }
      >
        <p>{format(t.rooms.alreadyInRoom, { code: current.code })}</p>
      </StatePanel>
    );
  }
  return <JoinRoomForm code={parsed.code} t={t} />;
}
