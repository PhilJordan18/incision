import { describe, expect, it } from "vitest";
import { type PageIdEnvironment, type PageIdStorage, pageIdFor, randomPageId, reclaimPageId, releasePageId } from "./page-id";

const FIRST = "6f1c2a3b-4d5e-4f60-8a1b-2c3d4e5f6a7b";
const FRESH = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";

type TabStorage = PageIdStorage & { readonly clone: () => TabStorage };

/** A tab's sessionStorage; `clone` copies it, as a duplicated tab does. */
function tabStorage(entries: Record<string, string> = {}): TabStorage {
  const values = new Map(Object.entries(entries));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clone: () => tabStorage(Object.fromEntries(values)),
  };
}

function environment(storage: PageIdStorage, navigationType: string | undefined, randomId = () => FRESH): PageIdEnvironment {
  return { storage: () => storage, navigationType: () => navigationType, randomId };
}

describe("the page id", () => {
  it("reuses the id that the tab's previous document released, on a reload only", () => {
    const storage = tabStorage();
    const first = pageIdFor(environment(storage, "navigate", () => FIRST));
    expect(first).toBe(FIRST);
    releasePageId(environment(storage, "navigate"), first);
    expect(pageIdFor(environment(storage, "reload"))).toBe(FIRST);
  });

  it("gives a fresh id to a duplicate of a live tab, even when it reports a reload", () => {
    const original = tabStorage();
    pageIdFor(environment(original, "navigate", () => FIRST));
    // Chrome's reload-button duplicate: sessionStorage copied, then reloaded; the original released nothing.
    const duplicate = original.clone();
    expect(pageIdFor(environment(duplicate, "reload"))).toBe(FRESH);
    // The original's next reload still finds its own id.
    releasePageId(environment(original, "navigate"), FIRST);
    expect(pageIdFor(environment(original, "reload"))).toBe(FIRST);
  });

  it("uses a release once: a later duplicate of the reloaded tab gets a fresh id", () => {
    const storage = tabStorage();
    pageIdFor(environment(storage, "navigate", () => FIRST));
    releasePageId(environment(storage, "navigate"), FIRST);
    expect(pageIdFor(environment(storage, "reload"))).toBe(FIRST);
    expect(pageIdFor(environment(storage.clone(), "reload"))).toBe(FRESH);
  });

  it("gives a fresh id to a navigation, a history traversal or an unknown navigation, even after a release", () => {
    for (const type of ["navigate", "back_forward", "prerender", undefined]) {
      const storage = tabStorage({ "incision.pageId": FIRST, "incision.pageId.released": FIRST });
      expect(pageIdFor(environment(storage, type))).toBe(FRESH);
      // Stored for this tab's next reload.
      expect(storage.getItem("incision.pageId")).toBe(FRESH);
    }
  });

  it("forgets a release once the page comes back from the back-forward cache", () => {
    const storage = tabStorage();
    pageIdFor(environment(storage, "navigate", () => FIRST));
    releasePageId(environment(storage, "navigate"), FIRST);
    reclaimPageId(environment(storage, "navigate"));
    expect(pageIdFor(environment(storage.clone(), "reload"))).toBe(FRESH);
  });

  it("refuses a stored value that is not a UUID, or a release of another id", () => {
    const invalid = tabStorage({ "incision.pageId": "page-1", "incision.pageId.released": "page-1" });
    expect(pageIdFor(environment(invalid, "reload"))).toBe(FRESH);
    const other = tabStorage({ "incision.pageId": FIRST, "incision.pageId.released": FRESH });
    expect(pageIdFor(environment(other, "reload", () => "2b3c4d5e-6f70-4182-a3b4-c5d6e7f80912"))).toBe(
      "2b3c4d5e-6f70-4182-a3b4-c5d6e7f80912",
    );
  });

  it("draws a fresh id when storage or the navigation timing throws", () => {
    const blocked: PageIdEnvironment = {
      storage: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      navigationType: () => "reload",
      randomId: () => FRESH,
    };
    expect(pageIdFor(blocked)).toBe(FRESH);
    expect(() => releasePageId(blocked, FRESH)).not.toThrow();
    expect(() => reclaimPageId(blocked)).not.toThrow();
    const storage = tabStorage({ "incision.pageId": FIRST, "incision.pageId.released": FIRST });
    const noTiming: PageIdEnvironment = {
      storage: () => storage,
      navigationType: () => {
        throw new ReferenceError("PerformanceNavigationTiming is not defined");
      },
      randomId: () => FRESH,
    };
    expect(pageIdFor(noTiming)).toBe(FRESH);
  });

  it("draws version 4 UUIDs", () => {
    expect(randomPageId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
