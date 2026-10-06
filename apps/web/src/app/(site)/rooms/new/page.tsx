import { findActiveMembership } from "@incision/database";
import type { Metadata } from "next";
import Link from "next/link";
import { LeaveRoomForm } from "@/components/rooms/leave-room-form";
import { PageHeading } from "@/components/ui/page-heading";
import { StatePanel } from "@/components/ui/state-panel";
import { card, secondaryButton } from "@/components/ui/styles";
import { getRequestDictionary } from "@/i18n/server";
import { format } from "@/i18n/format";
import { requireAccountSession } from "@/server/auth/session";
import { authDatabase } from "@/server/auth/store";
import { CreateRoomForm } from "./create-room-form";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getRequestDictionary();
  return { title: t.rooms.newTitle };
}

/** Create a room (SALLE-01), by code at the checkpoint; signed-in accounts only. */
export default async function NewRoomPage() {
  const { accountId } = await requireAccountSession("/rooms/new");
  const [{ t }, current] = await Promise.all([getRequestDictionary(), findActiveMembership(authDatabase(), accountId)]);
  if (current !== undefined) {
    return (
      <StatePanel
        tone="warning"
        label={t.rooms.alreadyInRoomLabel}
        heading={{ bold: t.rooms.newHeadingBold, serif: t.rooms.newHeadingSerif }}
        actions={
          <>
            <Link href={`/rooms/${current.code}`} className={secondaryButton}>
              {t.rooms.goToMyRoom}
            </Link>
            <LeaveRoomForm label={format(t.rooms.leaveMyRoom, { code: current.code })} pendingLabel={t.rooms.leaving} returnTo="/rooms/new" />
          </>
        }
      >
        <p>{format(t.rooms.alreadyInRoom, { code: current.code })}</p>
      </StatePanel>
    );
  }
  return (
    <>
      <PageHeading bold={t.rooms.newHeadingBold} serif={t.rooms.newHeadingSerif} />
      <section className={`${card} flex max-w-xl flex-col gap-5`}>
        <p className="text-embrun">{t.rooms.newIntro}</p>
        <CreateRoomForm t={t.rooms} />
      </section>
    </>
  );
}
