/** A public nickname generates initials, never a photo or an identity credential. */
export function GuestAvatar({ nickname, label }: { readonly nickname: string; readonly label: string }) {
  const initials = Array.from(nickname.normalize("NFKC").trim()).slice(0, 2).join("").toLocaleUpperCase();
  return <span role="img" aria-label={label} className="inline-flex size-14 shrink-0 items-center justify-center rounded-full border border-houle bg-sillage font-mono text-lg text-embrun">{initials || "·"}</span>;
}
