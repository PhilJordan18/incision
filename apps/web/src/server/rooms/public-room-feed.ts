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
  /** The list as last sent to watchers: a read for a new watcher must not hide a change from them. */
  private published: string | undefined;
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

  /**
   * The list for a new watcher or a page: the cached one while fresh, otherwise one shared read.
   * A stale list read less than `throttleMs` ago is still served, so callers cannot read more
   * often than the broadcasts do; the planned read then sends the change to watchers.
   */
  async current(): Promise<readonly PublicRoomEntry[]> {
    const age = this.options.now() - this.loadedAt;
    let list = this.rooms;
    if (list === undefined || age >= this.refreshMs || (this.stale && age >= this.throttleMs)) list = await this.read();
    else if (this.stale) this.plan();
    // The first list given out is what the watchers hold until a broadcast changes it.
    this.published ??= JSON.stringify(list);
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
    let rooms: readonly PublicRoomEntry[];
    try {
      rooms = await this.read();
    } catch {
      return;
    }
    const serialized = JSON.stringify(rooms);
    if (this.stopped || serialized === this.published) return;
    this.published = serialized;
    this.options.publish(rooms);
  }

  private read(): Promise<readonly PublicRoomEntry[]> {
    this.loading ??= (async () => {
      this.stale = false;
      this.loadedAt = this.options.now();
      try {
        const rooms = (await this.options.load()).map(publicRoomEntry);
        this.rooms = rooms;
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

type ProcessGlobal = typeof globalThis & { incisionPublicRoomFeed?: PublicRoomFeed };
const processGlobal = globalThis as ProcessGlobal;

/** The server's one feed, also read by the /rooms page (same process), so pages share its reads. */
export function sharedPublicRoomFeed(): PublicRoomFeed | undefined {
  return processGlobal.incisionPublicRoomFeed;
}

export function shareFeed(feed: PublicRoomFeed | undefined): void {
  processGlobal.incisionPublicRoomFeed = feed;
}
