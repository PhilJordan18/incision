import type { GuestSocketSession } from "./human-handshake";

/** What the registry needs from a socket; Socket.IO's Socket satisfies it. */
export type RegisteredSocket = { readonly id: string; disconnect(close: boolean): unknown };

type Entry = {
  readonly socket: RegisteredSocket;
  readonly accountId: string;
  readonly sessionVersion: number;
  readonly timer: ReturnType<typeof setTimeout>;
};

/**
 * Authenticated sockets of this process, by account (single instance, ADR-0001). Each
 * socket is disconnected when its session expires or when its account signs out.
 */
export class SessionRegistry {
  readonly #entries = new Map<string, Entry>();
  readonly #guests = new Map<string, { socket: RegisteredSocket; sessionId: string; expiresAt: number; timer: ReturnType<typeof setTimeout> }>();
  /** Lowest valid version per account after a revocation seen by this process, with its expiry. */
  readonly #minimumVersions = new Map<string, { readonly version: number; readonly until: number }>();

  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  /**
   * Tracks an authenticated socket until `expiresAt`, then disconnects it. Refuses a
   * session already revoked in this process (a sign-out that raced the handshake).
   */
  register(socket: RegisteredSocket, session: { accountId: string; sessionVersion: number; expiresAt: number }): boolean {
    if (!this.isCurrent(session)) {
      return false;
    }
    const delay = Math.max(0, session.expiresAt - this.#now());
    const timer = setTimeout(() => socket.disconnect(true), delay);
    timer.unref?.();
    this.#entries.set(socket.id, { socket, accountId: session.accountId, sessionVersion: session.sessionVersion, timer });
    return true;
  }

  /** Guest and account UUID namespaces never share revocation or expiration state. */
  registerGuest(socket: RegisteredSocket, session: GuestSocketSession): boolean {
    return this.#trackGuest(socket, session.proof.id, session.expiresAt);
  }

  #trackGuest(socket: RegisteredSocket, sessionId: string, expiresAt: number): boolean {
    if (!Number.isFinite(expiresAt) || expiresAt <= this.#now()) return false;
    const previous = this.#guests.get(socket.id);
    if (previous !== undefined) clearTimeout(previous.timer);
    const entry = { socket, sessionId, expiresAt,
      timer: setTimeout(() => {
        if (this.#guests.get(socket.id) !== entry) return;
        this.#guests.delete(socket.id);
        socket.disconnect(true);
      }, expiresAt - this.#now()) };
    entry.timer.unref?.();
    this.#guests.set(socket.id, entry);
    return true;
  }

  /** Only a successful database read/touch may supply this deadline. No activity is inferred. */
  refreshGuest(sessionId: string, expiresAt: number): void {
    for (const entry of this.#guests.values()) {
      if (entry.sessionId !== sessionId || expiresAt <= entry.expiresAt) continue;
      this.#trackGuest(entry.socket, sessionId, expiresAt);
    }
  }

  isGuestCurrent(socketId: string, sessionId: string): boolean {
    const entry = this.#guests.get(socketId);
    return entry !== undefined && entry.sessionId === sessionId && entry.expiresAt > this.#now();
  }

  unregister(socketId: string): void {
    const guest = this.#guests.get(socketId);
    if (guest !== undefined) { clearTimeout(guest.timer); this.#guests.delete(socketId); }
    const entry = this.#entries.get(socketId);
    if (entry !== undefined) {
      clearTimeout(entry.timer);
      this.#entries.delete(socketId);
    }
  }

  /** False once the account signed out in this process after this session started. */
  isCurrent(session: { accountId: string; sessionVersion: number }): boolean {
    const minimum = this.#minimumVersions.get(session.accountId);
    return minimum === undefined || minimum.until <= this.#now() || session.sessionVersion >= minimum.version;
  }

  /**
   * Records that versions below `newVersion` are revoked, then disconnects every
   * socket of the account that used one. Returns the number of sockets closed.
   */
  revoke(accountId: string, newVersion: number, sessionsValidUntil: number): number {
    this.#minimumVersions.set(accountId, { version: newVersion, until: sessionsValidUntil });
    let closed = 0;
    for (const entry of [...this.#entries.values()]) {
      if (entry.accountId === accountId && entry.sessionVersion < newVersion) {
        this.unregister(entry.socket.id);
        entry.socket.disconnect(true);
        closed += 1;
      }
    }
    this.#pruneExpiredRevocations();
    return closed;
  }

  get size(): number {
    return this.#entries.size + this.#guests.size;
  }

  #pruneExpiredRevocations(): void {
    const now = this.#now();
    for (const [accountId, minimum] of this.#minimumVersions) {
      if (minimum.until <= now) {
        this.#minimumVersions.delete(accountId);
      }
    }
  }
}

const processGlobal = globalThis as typeof globalThis & { incisionSessionRegistry?: SessionRegistry };

/**
 * The registry of this process. Next.js bundles server actions separately from the
 * custom server, so a module-level instance would exist twice; `globalThis` is shared.
 */
export function getSessionRegistry(): SessionRegistry {
  processGlobal.incisionSessionRegistry ??= new SessionRegistry();
  return processGlobal.incisionSessionRegistry;
}
