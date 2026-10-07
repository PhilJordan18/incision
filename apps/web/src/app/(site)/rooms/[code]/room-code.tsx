/** A room code as the design shows it (screen 06): Geist Mono, medium, widely spaced. */
export function RoomCode({ code }: { readonly code: string }) {
  return <span className="font-mono text-[34px] leading-none font-medium tracking-[0.24em]">{code}</span>;
}
