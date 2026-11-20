import type { BotLevel } from "@incision/domain";
import type { Locale } from "@/i18n/locale";
import { roomBotsCopy } from "@/i18n/room-bots";

/** Persisted identity only. No score, rank or name heuristic decides whether someone is a bot. */
export function BotIdentityLabel({ kind, level, locale }: {
  readonly kind?: "human" | "bot"; readonly level?: BotLevel | null; readonly locale: Locale;
}) {
  if (kind !== "bot") return null;
  const t = roomBotsCopy(locale);
  return <span className="block text-sm font-normal text-brume"><span aria-hidden="true">□ </span>{t.label}{level == null ? "" : ` · ${t.levels[level]}`}</span>;
}
