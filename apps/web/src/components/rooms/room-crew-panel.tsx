import { Pennant, SpectatorEye } from "@/components/nautical";
import { GuestAvatar } from "@/components/rooms/guest-avatar";
import { card, monoLabel, panelTitle } from "@/components/ui/styles";
import type { Dictionary } from "@/i18n/dictionaries";
import { format } from "@/i18n/format";
import type { Locale } from "@/i18n/locale";
import { roomCrewCopy } from "@/i18n/room-crew";
import { formatNumber } from "@/i18n/value-format";
import type { PublicRoomSnapshot } from "@/rooms/protocol";

/**
 * Spectators a room holds (D-22). The domain applies the quota (`admissionRefusal`) without
 * exporting it; this copy is only shown, never used to decide.
 */
const ROOM_MAX_SPECTATORS = 20;

type Member = PublicRoomSnapshot["members"][number];

type Props = {
  readonly snapshot: PublicRoomSnapshot;
  readonly selfMemberId: string;
  readonly t: Dictionary["rooms"];
  readonly locale: Locale;
};

/**
 * The crew (DA2-5a): participants, then spectators, each group with its own count. The top
 * counter stays the room's places: participants and bots over the capacity (SALLE-05).
 */
export function RoomCrewPanel({ snapshot, selfMemberId, t, locale }: Props) {
  const copy = roomCrewCopy(locale);
  const participants = snapshot.members.filter((member) => member.role === "participant");
  const spectators = snapshot.members.filter((member) => member.role === "spectator");
  const places = participants.length + (snapshot.bots?.length ?? 0);
  return (
    <section aria-labelledby="crew-heading" className={`${card} flex min-w-0 flex-col gap-4`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="crew-heading" className={panelTitle}>
          {t.membersHeading}
        </h2>
        <p className="font-mono text-sm text-brume">{format(t.membersCount, { count: formatNumber(places, locale), capacity: formatNumber(snapshot.capacity, locale) })}</p>
      </div>
      <CrewGroup id="crew-participants" label={copy.participants} count={formatNumber(participants.length, locale)} members={participants} selfMemberId={selfMemberId} t={t} />
      <CrewGroup
        id="crew-spectators"
        label={copy.spectators}
        count={format(copy.spectatorCount, { count: formatNumber(spectators.length, locale), max: formatNumber(ROOM_MAX_SPECTATORS, locale) })}
        members={spectators}
        selfMemberId={selfMemberId}
        t={t}
      />
    </section>
  );
}

type GroupProps = {
  readonly id: string;
  readonly label: string;
  readonly count: string;
  readonly members: readonly Member[];
  readonly selfMemberId: string;
  readonly t: Dictionary["rooms"];
};

function CrewGroup({ id, label, count, members, selfMemberId, t }: GroupProps) {
  return (
    <div className="flex flex-col gap-1">
      <h3 id={id} className={`${monoLabel} flex items-baseline justify-between gap-3`}>
        <span>{label}</span>
        <span>{count}</span>
      </h3>
      {members.length > 0 && (
        <ul aria-labelledby={id} className="flex flex-col divide-y divide-sillage">
          {members.map((member) => (
            <li key={member.memberId} className="flex min-h-11 flex-wrap items-center gap-3 py-2">
              <span aria-hidden="true" className={`size-2.5 shrink-0 rounded-full forced-colors:border-2 forced-colors:border-[CanvasText] ${member.online ? "bg-juste forced-colors:bg-[CanvasText]" : "bg-voile forced-colors:bg-[Canvas]"}`} />
              {/* C1 vocabulary: a participant flies a pennant (mine in my colour), a spectator has an eye. The role is also written. */}
              {member.role === "spectator" ? <SpectatorEye className="shrink-0" /> : <Pennant kind="human" colour={member.memberId === selfMemberId ? "moi" : "ecume"} className="shrink-0" />}
              {member.isGuest && <GuestAvatar compact nickname={member.displayName} label={t.guestLabel} />}
              <span className="min-w-0 font-semibold break-words">
                {member.displayName}
                {member.memberId === selfMemberId ? <span className="font-normal text-brume"> ({t.you})</span> : null}
              </span>
              {member.isHost && <span className="font-mono text-[10px] tracking-[0.2em] text-ligne uppercase">{t.host}</span>}
              <span className="text-sm text-brume">{t.roleNames[member.role]}</span>
              <span className="ml-auto text-sm text-brume">{member.online ? t.online : t.offline}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
