/**
 * The id of a room page (one tab, one document), sent with each watch: the server gives its race
 * input back at once to a page that reconnects, or to a tab that reloads (state-machines §2).
 */

/** sessionStorage, per tab: this tab's page id, and the id its last document released when it went away. */
const PAGE_ID_KEY = "incision.pageId";
const RELEASED_KEY = "incision.pageId.released";
const PAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export type PageIdStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type PageIdEnvironment = {
  /** May throw: storage blocked. */
  readonly storage: () => PageIdStorage;
  /** The document's `PerformanceNavigationTiming.type`; may throw where the API does not exist. */
  readonly navigationType: () => string | undefined;
  readonly randomId: () => string;
};

/**
 * The id of a new document. A reload reuses the id that its tab's previous document released
 * when it went away (`pagehide`); any other document gets a fresh one. A duplicated tab copies
 * sessionStorage, and Chrome's reload-button duplicate even reports a reload, but its original is
 * still open and released nothing: the duplicate gets its own id and observes.
 */
export function pageIdFor(environment: PageIdEnvironment): string {
  let storage: PageIdStorage | undefined;
  try {
    storage = environment.storage();
    const stored = storage.getItem(PAGE_ID_KEY);
    const released = storage.getItem(RELEASED_KEY);
    // Used once: a later duplicate of this tab finds no release.
    storage.removeItem(RELEASED_KEY);
    if (environment.navigationType() === "reload" && stored !== null && released === stored && PAGE_ID.test(stored)) {
      return stored;
    }
  } catch {
    // Storage blocked: a fresh id, as for a new tab.
  }
  const id = environment.randomId();
  try {
    storage?.setItem(PAGE_ID_KEY, id);
  } catch {
    // Kept for this document only.
  }
  return id;
}

/** The page goes away (reload, navigation, back-forward cache): only the next reload of its tab may reuse its id. */
export function releasePageId(environment: PageIdEnvironment, id: string): void {
  try {
    environment.storage().setItem(RELEASED_KEY, id);
  } catch {
    // The reload gets a fresh id and takes the input after the server's grace.
  }
}

/** Back from the back-forward cache: the page holds its id again. */
export function reclaimPageId(environment: PageIdEnvironment): void {
  try {
    environment.storage().removeItem(RELEASED_KEY);
  } catch {
    // Nothing was released.
  }
}

/** `randomUUID` exists only in secure contexts (HTTPS, localhost); elsewhere a v4 UUID from `getRandomValues`. */
export function randomPageId(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const browser: PageIdEnvironment = {
  storage: () => window.sessionStorage,
  navigationType: () => {
    const entry = performance.getEntriesByType("navigation")[0];
    return entry instanceof PerformanceNavigationTiming ? entry.type : undefined;
  },
  randomId: randomPageId,
};

/** One id per tab and document, shared by every mount of the room view in it. */
let documentPageId: string | undefined;

/** This document's page id, drawn once in the browser. */
export function thisPageId(): string {
  if (typeof window === "undefined") {
    // Server render: never sent from there; the client draws the id when it hydrates.
    return "";
  }
  if (documentPageId === undefined) {
    const id = pageIdFor(browser);
    documentPageId = id;
    window.addEventListener("pagehide", () => releasePageId(browser, id));
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) {
        reclaimPageId(browser);
      }
    });
  }
  return documentPageId;
}
