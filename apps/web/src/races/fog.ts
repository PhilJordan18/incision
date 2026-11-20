/** Preserve the typed prefix, the current token and its separator. No animation or layout edit. */
export function fogStartsAt(target: readonly string[], position: number): number {
  let end = Math.min(target.length, Math.max(0, position));
  while (end < target.length && target[end] !== " ") end += 1;
  while (end < target.length && target[end] === " ") end += 1;
  return end;
}
