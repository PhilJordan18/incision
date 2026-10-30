import { parseRoomCode } from "@incision/domain";
import { z } from "zod";

const fields = z.object({
  memberId: z.uuid().transform((value) => value.toLowerCase()),
  revision: z.string().regex(/^\d{1,10}$/).transform(Number)
    .pipe(z.number().int().min(0).max(2_147_483_646)),
});

/** Parse intent only; membership, identity and host authority are re-read server-side. */
export function parseModerationForm(form: FormData) {
  const one = (name: string) => {
    const values = form.getAll(name);
    return values.length === 1 ? values[0] : undefined;
  };
  const rawCode = one("code");
  const code = typeof rawCode === "string" ? parseRoomCode(rawCode) : undefined;
  const parsed = fields.safeParse({ memberId: one("memberId"), revision: one("revision") });
  return code?.ok && parsed.success ? { code: code.code, ...parsed.data } : undefined;
}
