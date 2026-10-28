import { BOT_LEVELS, parseRoomCode, type RoomCode } from "@incision/domain";
import type { BotChange } from "@incision/database";
import { z } from "zod";

const id = z.uuid().transform((value) => value.toLowerCase());
const schema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("add"), level: z.enum(BOT_LEVELS) }),
  z.object({ kind: z.literal("remove"), botId: id }),
  z.object({ kind: z.literal("level"), botId: id, level: z.enum(BOT_LEVELS) }),
]);
const revisionSchema = z.string().regex(/^\d{1,10}$/).transform(Number).pipe(z.number().int().min(0).max(2_147_483_646));

export function parseBotForm(form: FormData): { code: RoomCode; revision: number; change: BotChange } | undefined {
  const one = (name: string) => { const values = form.getAll(name); return values.length === 1 ? values[0] : undefined; };
  const rawCode = one("code");
  const code = typeof rawCode === "string" ? parseRoomCode(rawCode) : undefined;
  const revision = revisionSchema.safeParse(one("revision"));
  const change = schema.safeParse({ kind: one("kind"), botId: one("botId"), level: one("level") });
  if (!code?.ok || !revision.success || !change.success) return undefined;
  return { code: code.code, revision: revision.data, change: change.data };
}
