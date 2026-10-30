import { parseRoomCode, ROOM_MIN_CAPACITY, ROOM_MAX_CAPACITY } from "@incision/domain";
import { z } from "zod";

const integer = z.string().regex(/^\d{1,10}$/).transform(Number).pipe(z.number().int());
const capacityField = integer.pipe(z.number().min(ROOM_MIN_CAPACITY).max(ROOM_MAX_CAPACITY));
const fields = z.object({
  revision: integer.pipe(z.number().min(0).max(2_147_483_646)),
  capacity: capacityField,
});

/** Old forms without the field retain the established default; supplied values must be valid. */
export function parseCreationCapacity(form: FormData): number | undefined {
  const values = form.getAll("capacity");
  if (values.length === 0) return ROOM_MAX_CAPACITY;
  if (values.length !== 1) return undefined;
  const parsed = capacityField.safeParse(values[0]);
  return parsed.success ? parsed.data : undefined;
}

export function parseCapacityForm(form: FormData) {
  const one = (name: string) => { const values = form.getAll(name); return values.length === 1 ? values[0] : undefined; };
  const rawCode = one("code");
  const code = typeof rawCode === "string" ? parseRoomCode(rawCode) : undefined;
  const parsed = fields.safeParse({ revision: one("revision"), capacity: one("capacity") });
  return code?.ok && parsed.success ? { code: code.code, ...parsed.data } : undefined;
}
