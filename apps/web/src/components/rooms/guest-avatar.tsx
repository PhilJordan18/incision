/** A public nickname generates initials, never a photo or an identity credential. */
export function GuestAvatar({ nickname, label, compact = false }: { readonly nickname: string; readonly label: string; readonly compact?: boolean }) {
  const initials = Array.from(nickname.normalize("NFKC").trim()).slice(0, 2).join("").toLocaleUpperCase();
  return <span role="img" aria-label={label} className={`inline-flex shrink-0 items-center justify-center rounded-full border border-houle bg-sillage font-mono text-embrun ${compact ? "size-8 text-xs" : "size-14 text-lg"}`}>{initials || "·"}</span>;
}
