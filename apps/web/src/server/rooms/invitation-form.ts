import { MEMBER_ROLES, parseRoomCode } from "@incision/domain";
import { z } from "zod";
import { guestStartSchema } from "@/identity/guest-contract";
import { invitationTokenDigest } from "./invitation-credentials";

function one(form: FormData, name: string) {
  const values = form.getAll(name);
  return values.length === 1 ? values[0] : undefined;
}
export function invitationRoomCode(form: FormData) {
  const value = one(form, "code");
  const parsed = parseRoomCode(typeof value === "string" ? value : "");
  return parsed.ok ? parsed.code : undefined;
}
export function invitationId(form: FormData) {
  const parsed = z.uuid().transform((id) => id.toLowerCase()).safeParse(one(form, "invitationId"));
  return parsed.success ? parsed.data : undefined;
}
export function invitationPage(form: FormData) {
  const parsed = z.string().regex(/^(0|[1-9]\d{0,5})$/).transform(Number).pipe(z.number().max(100_000)).safeParse(one(form, "page"));
  return parsed.success ? parsed.data : undefined;
}
export function invitationAdmission(form: FormData) {
  const tokenDigest = invitationTokenDigest(one(form, "token"));
  const role = z.enum(MEMBER_ROLES).safeParse(one(form, "role"));
  if (tokenDigest === undefined || !role.success) return undefined;
  const nickname = guestStartSchema.safeParse({ nickname: one(form, "nickname") });
  return { tokenDigest, role: role.data, nickname: nickname.success ? nickname.data.nickname : undefined };
}
