import type { RoomSnapshot } from "@incision/database";
import type { PublicRoomSnapshot } from "./protocol";

/** What members see of a room: member ids, names, roles, host and online flags, how its race stands, and its settings. */
export function publicSnapshot(snapshot: RoomSnapshot, online: ReadonlySet<string>): PublicRoomSnapshot {
  return {
    code: snapshot.code,
    phase: snapshot.phase,
    capacity: snapshot.capacity,
    revision: snapshot.revision,
    bots: snapshot.bots.map(({ botId, level }) => ({ botId, level })),
    members: snapshot.members.map(({ memberId, accountId, displayName, role, isHost }) => ({
      memberId,
      displayName,
      role,
      isHost,
      ...(accountId === null ? { isGuest: true } : {}),
      online: online.has(memberId),
    })),
    ...(snapshot.race === undefined ? {} : { race: snapshot.race }),
    settings: {
      revision: snapshot.settings.revision,
      textLanguage: snapshot.settings.textLanguage,
      wordCount: snapshot.settings.wordCount,
      timeLimitMs: snapshot.settings.timeLimitMs,
      errorMode: snapshot.settings.errorMode,
      textKind: snapshot.settings.textKind,
      complexity: snapshot.settings.complexity,
      punctuation: snapshot.settings.punctuation,
      numbers: snapshot.settings.numbers,
      capitals: snapshot.settings.capitals,
      accents: snapshot.settings.accents,
      includeCharacters: [...snapshot.settings.includeCharacters],
      excludeCharacters: [...snapshot.settings.excludeCharacters],
      bonusesEnabled: snapshot.settings.bonusesEnabled,
    },
  };
}
