import type { BotLevel } from "@incision/domain";

/** Original room-only maritime marks. The adjacent text carries name and difficulty. */
export function BotInsignia({ level }: { readonly level: BotLevel }) {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className="h-12 w-12 shrink-0 rounded-bouton border border-houle p-1 text-embrun" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {level === "noob" && <><path d="M24 8v26H10L24 12l14 22H24M8 39q8-4 16 0t16 0" /></>}
    {level === "beginner" && <><circle cx="24" cy="10" r="4" /><path d="M24 14v25M15 21h18M9 29c0 14 30 14 30 0M9 29l-2 6m2-6 6 2m24-2 2 6m-2-6-6 2" /></>}
    {level === "intermediate" && <><circle cx="24" cy="24" r="12" /><circle cx="24" cy="24" r="3" /><path d="M24 5v16m0 6v16M5 24h16m6 0h16M10 10l12 12m4 4 12 12M10 38l12-12m4-4 12-12" /></>}
    {level === "expert" && <><circle cx="24" cy="24" r="18" /><path d="m24 9 5 10 10 5-10 5-5 10-5-10-10-5 10-5Z" /><circle cx="24" cy="24" r="3" /></>}
    {level === "impossible" && <><path d="m8 13 9 7 7-12 7 12 9-7-4 20H12ZM13 37h22M18 41h12" /><path d="M17 28h14" /></>}
  </svg>;
}
