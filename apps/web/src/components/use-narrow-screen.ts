"use client";

import { useSyncExternalStore } from "react";

const WIDE_SCREEN = "(min-width: 768px)";

function subscribe(changed: () => void): () => void {
  const query = window.matchMedia(WIDE_SCREEN);
  query.addEventListener("change", changed);
  return () => query.removeEventListener("change", changed);
}

function isNarrow(): boolean {
  return !window.matchMedia(WIDE_SCREEN).matches;
}

// The server cannot know viewport width. Start conservatively, with no typing/participation,
// then resolve the real width after hydration; never infer a physical keyboard from a device.
const serverSnapshot = () => true;

export function useNarrowScreen(): boolean {
  return useSyncExternalStore(subscribe, isNarrow, serverSnapshot);
}
