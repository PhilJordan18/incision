/**
 * Open sockets per room member, in memory (single instance, ADR-0001). Presence is about
 * connections only: membership itself lives in the database.
 */
export class RoomPresence {
  readonly #sockets = new Map<string, Map<string, Set<string>>>();

  /** Returns true when the member just came online. */
  add(lobbyId: string, memberId: string, socketId: string): boolean {
    const members = this.#sockets.get(lobbyId) ?? new Map<string, Set<string>>();
    this.#sockets.set(lobbyId, members);
    const sockets = members.get(memberId) ?? new Set<string>();
    members.set(memberId, sockets);
    sockets.add(socketId);
    return sockets.size === 1;
  }

  /** Returns true when the member just went offline. */
  remove(lobbyId: string, memberId: string, socketId: string): boolean {
    const members = this.#sockets.get(lobbyId);
    const sockets = members?.get(memberId);
    if (members === undefined || sockets === undefined || !sockets.delete(socketId)) {
      return false;
    }
    if (sockets.size > 0) {
      return false;
    }
    members.delete(memberId);
    if (members.size === 0) {
      this.#sockets.delete(lobbyId);
    }
    return true;
  }

  onlineMembers(lobbyId: string): ReadonlySet<string> {
    return new Set(this.#sockets.get(lobbyId)?.keys() ?? []);
  }
}
