import type { PublicRoom } from "@incision/database";
import { admitsNewMembers } from "@incision/domain";
import type { PublicRoomEntry } from "../../rooms/public-rooms-protocol";

/** What the explorer sends for one room: no id, no creation time, only what a public room shows. */
export function publicRoomEntry(room: PublicRoom): PublicRoomEntry {
  return {
    code: room.code, hostName: room.hostName, phase: room.phase, participants: room.participants, capacity: room.capacity,
    textLanguage: room.textLanguage, complexity: room.complexity, textKind: room.textKind, wordCount: room.wordCount,
    arcade: room.arcade, joinable: admitsNewMembers(room.phase) && room.participants < room.capacity,
  };
}

type Options = {
  readonly load: () => Promise<readonly PublicRoom[]>;
  /** Sends a new list to every watcher. */
  readonly publish: (rooms: readonly PublicRoomEntry[]) => void;
  readonly watched: () => boolean;
  readonly now: () => number;
  readonly schedule: (callback: () => void, delayMs: number) => () => void;
  readonly logError: (message: string) => void;
  /** At most one read and one broadcast per interval, however many rooms change (JOIN-02). */
  readonly throttleMs?: number;
  /** Read again this often while watched: changes made by another process, or missed events. */
  readonly refreshMs?: number;
};

export const PUBLIC_ROOM_FEED = { throttleMs: 1_000, refreshMs: 15_000 } as const;

/**
 * The explorer's list (JOIN-02). Room changes mark it stale; while someone watches, it is read
 * again at most once per `throttleMs` and broadcast only when it differs. Nobody watching: no read.
 */
export class PublicRoomFeed {
  private readonly throttleMs: number;
  private readonly refreshMs: number;
  private rooms: readonly PublicRoomEntry[] | undefined;
  private serialized = "";
  private loadedAt = Number.NEGATIVE_INFINITY;
  private stale = true;
  private loading: Promise<readonly PublicRoomEntry[]> | undefined;
  private cancelPending: (() => void) | undefined;
  private cancelRefresh: (() => void) | undefined;
  private stopped = false;

  constructor(private readonly options: Options) {
    this.throttleMs = options.throttleMs ?? PUBLIC_ROOM_FEED.throttleMs;
    this.refreshMs = options.refreshMs ?? PUBLIC_ROOM_FEED.refreshMs;
  }

  /** A room changed somewhere: the list is read again soon, if anyone watches. */
  changed(): void {
    this.stale = true;
    this.plan();
  }

  /** The list for a new watcher: the cached one while fresh, otherwise one shared read. */
  async current(): Promise<readonly PublicRoomEntry[]> {
    const fresh = !this.stale && this.rooms !== undefined && this.options.now() - this.loadedAt < this.refreshMs;
    const list = fresh && this.rooms !== undefined ? this.rooms : await this.read();
    this.keepRefreshing();
    return list;
  }

  stop(): void {
    this.stopped = true;
    this.cancelPending?.();
    this.cancelRefresh?.();
    this.cancelPending = undefined;
    this.cancelRefresh = undefined;
  }

  private plan(): void {
    if (this.stopped || this.cancelPending !== undefined || !this.options.watched()) return;
    const delay = Math.max(0, this.loadedAt + this.throttleMs - this.options.now());
    this.cancelPending = this.options.schedule(() => {
      this.cancelPending = undefined;
      void this.broadcast();
    }, delay);
  }

  private keepRefreshing(): void {
    if (this.stopped || this.cancelRefresh !== undefined) return;
    this.cancelRefresh = this.options.schedule(() => {
      this.cancelRefresh = undefined;
      if (!this.options.watched()) return;
      this.stale = true;
      this.plan();
      this.keepRefreshing();
    }, this.refreshMs);
  }

  private async broadcast(): Promise<void> {
    if (!this.options.watched()) return;
    const before = this.serialized;
    try {
      await this.read();
    } catch {
      return;
    }
    if (this.serialized !== before && this.rooms !== undefined && !this.stopped) this.options.publish(this.rooms);
  }

  private read(): Promise<readonly PublicRoomEntry[]> {
    this.loading ??= (async () => {
      this.stale = false;
      this.loadedAt = this.options.now();
      try {
        const rooms = (await this.options.load()).map(publicRoomEntry);
        this.rooms = rooms;
        this.serialized = JSON.stringify(rooms);
        return rooms;
      } catch (error: unknown) {
        this.stale = true;
        this.options.logError(`[rooms] public room list unavailable: ${error instanceof Error ? error.name : "unknown error"}`);
        throw error;
      } finally {
        this.loading = undefined;
      }
    })();
    return this.loading;
  }
}
