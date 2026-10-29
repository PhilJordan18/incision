import { and, eq, isNull, sql } from "drizzle-orm";
import type { Database } from "../client";
import { guestSessions, lobbies, lobbyMembers } from "../schema";
import { boundedTransaction, READ_COMMITTED } from "../transaction";
import { endDisconnectedGuestPresence } from "../rooms/guest-departure";
import { endDisconnectedHostPresence } from "../rooms/host-departure";
import { retireUnreferencedGuests } from "./guest-retirement";
import { purgeUnusedGuestSessions } from "./guest-sessions";

export type GuestRetentionReport = {
  readonly departed: readonly { lobbyId: string; memberId: string; closed: boolean }[];
  readonly purgedRooms: readonly string[];
  readonly unusedSessions: number;
};

/** Bounded local maintenance; expiry never depends on a socket having watched a room. */
export async function maintainGuestRetention(db: Database, online: (lobbyId: string) => ReadonlySet<string>): Promise<GuestRetentionReport> {
  const expired = await db.select({ lobbyId: lobbyMembers.lobbyId, memberId: lobbyMembers.id })
    .from(lobbyMembers).innerJoin(guestSessions, eq(guestSessions.id, lobbyMembers.guestSessionId))
    .where(and(isNull(lobbyMembers.leftAt), sql`${guestSessions.expiresAt} <= statement_timestamp()`))
    .orderBy(lobbyMembers.lobbyId, lobbyMembers.id).limit(50);
  const departed: { lobbyId: string; memberId: string; closed: boolean }[] = [];
  for (const member of expired) {
    const host = await endDisconnectedHostPresence(db, { ...member, claim: (state) => state.expired, online });
    if (host.kind === "departed") departed.push({ ...member, closed: host.closed });
    else if (host.kind === "not-host") {
      const guest = await endDisconnectedGuestPresence(db, { ...member, claim: (state) => state.expired });
      if (guest.kind === "departed") departed.push({ ...member, closed: false });
    }
  }
  // One-hour scheduling margin under D-07's maximum; never purge an open room.
  const rooms = await db.select({ id: lobbies.id }).from(lobbies)
    .where(and(eq(lobbies.phase, "closed"), sql`${lobbies.closedAt} <= statement_timestamp() - interval '23 hours'`))
    .orderBy(lobbies.closedAt, lobbies.id).limit(50);
  const purgedRooms: string[] = [];
  for (const room of rooms) {
    const purged = await boundedTransaction(db, async (tx) => {
      const [locked] = await tx.select({ id: lobbies.id }).from(lobbies).where(and(eq(lobbies.id, room.id),
        eq(lobbies.phase, "closed"), sql`${lobbies.closedAt} <= statement_timestamp() - interval '23 hours'`)).for("update");
      if (locked === undefined) return false;
      const guests = await tx.select({ id: guestSessions.id }).from(guestSessions)
        .where(sql`exists (select 1 from ${lobbyMembers} where ${lobbyMembers.lobbyId} = ${room.id} and ${lobbyMembers.guestSessionId} = ${guestSessions.id})`)
        .orderBy(guestSessions.id).for("update");
      await tx.update(lobbies).set({ currentRaceId: null }).where(eq(lobbies.id, room.id));
      // No-account race metadata has no personal history to preserve. Account races
      // survive the room FK's SET NULL, with entrants/results/series unchanged.
      await tx.execute(sql`delete from races r where r.lobby_id = ${room.id}::uuid
        and not exists (select 1 from race_entrants e where e.race_id = r.id and e.kind = 'human')`);
      await tx.delete(lobbies).where(eq(lobbies.id, room.id));
      await retireUnreferencedGuests(tx, guests.map((guest) => guest.id));
      return true;
    }, READ_COMMITTED);
    if (purged) purgedRooms.push(room.id);
  }
  return { departed, purgedRooms, unusedSessions: await purgeUnusedGuestSessions(db) };
}
