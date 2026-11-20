import { DEFAULT_CREATED_ROOM_VISIBILITY, parseRoomCode, ROOM_VISIBILITIES, type RoomVisibility } from "@incision/domain";
import { z } from "zod";

const visibilityField = z.enum(ROOM_VISIBILITIES);
const fields = z.object({
  revision: z.string().regex(/^\d{1,10}$/).transform(Number).pipe(z.number().int().min(0).max(2_147_483_646)),
  visibility: visibilityField,
});

/** Old forms without the field keep the established "by code" (D-19); a supplied value must be one of the three. */
export function parseCreationVisibility(form: FormData): RoomVisibility | undefined {
  const values = form.getAll("visibility");
  if (values.length === 0) return DEFAULT_CREATED_ROOM_VISIBILITY;
  if (values.length !== 1) return undefined;
  const parsed = visibilityField.safeParse(values[0]);
  return parsed.success ? parsed.data : undefined;
}

export function parseVisibilityForm(form: FormData) {
  const one = (name: string) => { const values = form.getAll(name); return values.length === 1 ? values[0] : undefined; };
  const rawCode = one("code");
  const code = typeof rawCode === "string" ? parseRoomCode(rawCode) : undefined;
  const parsed = fields.safeParse({ revision: one("revision"), visibility: one("visibility") });
  return code?.ok && parsed.success ? { code: code.code, ...parsed.data } : undefined;
}
