import { parseRoomCode } from "@incision/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinCodeForm } from "@/components/rooms/join-code-form";
import { LeaveRoomForm } from "@/components/rooms/leave-room-form";
import { StatePanel } from "@/components/ui/state-panel";
import { discreetButton, secondaryButton } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
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
  const state = parsed.ok && session !== null ? await loadRoomPage(session.accountId, parsed.code) : undefined;
  if (state?.kind === "throttled") {
    return { title: t.rooms.throttledHeading, robots: { index: false } };
  }
  if (!parsed.ok || state?.kind === "unknown") {
    // Answered with 200 (no notFound(), see apps/web/AGENTS.md): keep it out of indexes.
    return { title: t.rooms.unknownHeading, robots: { index: false } };
  }
  return { title: format(t.rooms.roomTitle, { code: parsed.code }) };
}

/**
 * A room's page (SALLE-01/02, JOIN-01). Members see the live waiting room; other signed-in
 * accounts can join an admitting room, or are offered to leave the room they are in
 * (SALLE-06). Nothing changes on a GET: joining and leaving are server actions. An unknown
 * code gets screen 15's "code not found" state rather than `notFound()`, which Next 16
 * renders only in the browser (no theme before paint, nothing without JavaScript).
 */
export default async function RoomPage({ params }: PageProps<"/rooms/[code]">) {
  const { code: raw } = await params;
  const parsed = parseRoomCode(raw);
  if (!parsed.ok) {
    const { t } = await getRequestDictionary();
    return <UnknownRoom t={t} />;
  }
  if (raw !== parsed.code) {
    redirect(`/rooms/${parsed.code}`);
  }
  const code = parsed.code;
  const { accountId } = await requireAccountSession(`/rooms/${code}`);
  const [{ t }, state] = await Promise.all([getRequestDictionary(), loadRoomPage(accountId, code)]);

  switch (state.kind) {
    case "unknown":
      return <UnknownRoom t={t} code={code} />;
    case "throttled":
      // The same panel whatever the code: it is not shown, and nothing about it is said.
      return (
        <StatePanel
          tone="warning"
          label={t.rooms.unknownLabel}
          heading={{ bold: t.rooms.throttledHeading }}
          actions={
            <Link href="/" className={discreetButton}>
              {t.rooms.backHome}
            </Link>
          }
        >
          <p>{t.home.codeErrors[state.refusal]}</p>
        </StatePanel>
      );
    case "member":
      // Presence comes with the socket; the first render shows nobody online yet. Keyed by
      // member: a new membership of the same room starts a fresh view.
      return (
        <RoomView key={state.memberId} initial={publicSnapshot(state.snapshot, new Set())} selfMemberId={state.memberId} t={t.rooms} />
      );
    case "notAdmitting": {
      const closed = state.phase === "closed";
      return (
        <StatePanel
          tone={closed ? "neutral" : "warning"}
          label={format(t.rooms.roomTitle, { code })}
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
          label={format(t.rooms.roomTitle, { code: state.current.code })}
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

/** Screen 15's "code not found": what happened, and the code field to try another one. */
function UnknownRoom({ t, code }: { readonly t: Dictionary; readonly code?: string }) {
  return (
    <StatePanel
      tone="neutral"
      label={t.rooms.unknownLabel}
      heading={{ bold: t.rooms.unknownHeading }}
      actions={
        <Link href="/rooms/new" className={discreetButton}>
          {t.rooms.createRoom}
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <p>{code === undefined ? t.rooms.invalid : format(t.rooms.unknown, { code })}</p>
        <JoinCodeForm t={t.home} />
      </div>
    </StatePanel>
  );
}
