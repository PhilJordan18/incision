import { readGuestRoom, readRoomRaceForGuest, type GuestSessionProof } from "@incision/database";
import { redirect } from "next/navigation";
import { GuestAvatar } from "@/components/rooms/guest-avatar";
import { HostRoundActions } from "@/components/rooms/host-round-actions";
import { RaceResults } from "@/components/races/race-results";
import { getRequestDictionary } from "@/i18n/server";
import { publicSnapshot } from "@/rooms/public-snapshot";
import { authDatabase } from "@/server/auth/store";
import { temporaryRoomResults } from "@/server/races/temporary-room-results";
import { RoomView } from "./room-view";

/** Server component only. The proof never crosses into RoomView's client props. */
export async function GuestRoomPage({ code, proof }: { readonly code: string; readonly proof: GuestSessionProof }) {
  const state = await readGuestRoom(authDatabase(), proof, code);
  if (state === undefined) redirect(`/guest?code=${code}`);
  const { t, locale } = await getRequestDictionary();
  const self = state.snapshot.members.find((member) => member.memberId === state.memberId);
  const result = state.snapshot.phase === "results" && state.snapshot.race?.state === "finished"
    ? await readRoomRaceForGuest(authDatabase(), { lobbyId: state.snapshot.lobbyId, raceId: state.snapshot.race.raceId, proof }) : undefined;
  const race = result === undefined ? undefined : temporaryRoomResults().apply(state.snapshot.lobbyId, result.view, result.memberId);
  return <>
    <div className="mb-4 flex items-center gap-3"><GuestAvatar nickname={self?.displayName ?? ""} label={t.guestEntry.avatar} /><p className="text-sm text-brume">{t.guestEntry.notice}</p></div>
    <RoomView guest key={state.memberId} initial={publicSnapshot(state.snapshot, new Set())} selfMemberId={state.memberId}
      t={t.rooms} tRaces={t.races} locale={locale} results={race === undefined ? undefined : {
        raceId: race.raceId,
        panel: <RaceResults race={race} t={t.races} locale={locale}
          actions={self?.isHost ? () => <HostRoundActions guest t={t.rooms.hostActions} code={code} raceId={race.raceId} /> : undefined} />,
      }} />
  </>;
}
