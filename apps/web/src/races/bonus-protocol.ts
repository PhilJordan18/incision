import { BONUS_KINDS, MAX_INSTANT, type ActivationReply, type BonusAnnouncement } from "@incision/domain";
import { z } from "zod";

export const RACE_BONUS_ACTIVATE_EVENT = "race:bonus:activate";
export const RACE_BONUS_ANNOUNCEMENT_EVENT = "race:bonus:announcement";
export const RACE_BONUS_SELF_EVENT = "race:bonus:self";
const sequence = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const instant = z.number().int().min(0).max(MAX_INSTANT);
const milestone = z.union([z.literal(25), z.literal(50), z.literal(75)]);

/** Identity, time, kind, target and content are never accepted from a socket. */
export const bonusActivationPayloadSchema = z.object({
  raceId: z.uuid(), seq: sequence.min(1), milestone,
}).strict();
export type BonusActivationPayload = z.infer<typeof bonusActivationPayloadSchema>;

export const bonusSelfSchema = z.object({
  raceId: z.uuid(), revision: sequence, ackSeq: sequence,
  enabled: z.boolean(),
  grants: z.array(z.object({ milestone, kind: z.enum(BONUS_KINDS) }).strict()).max(3),
  fog: z.object({ startsAt: instant, expiresAt: instant }).strict().nullable(),
}).strict().refine(self => self.grants.every((grant, index) =>
  index === 0 || grant.milestone > self.grants[index - 1].milestone), "Grants must be unique and ordered")
  .refine(self => self.fog === null || self.fog.expiresAt > self.fog.startsAt, "Invalid fog interval");
export type BonusSelf = z.infer<typeof bonusSelfSchema>;
export type BonusActivationAck =
  | { readonly ok: true; readonly result: ActivationReply; readonly self: BonusSelf }
  | { readonly ok: false; readonly error: "UNAUTHORIZED" | "INVALID_PAYLOAD" | "NOT_AN_ENTRANT" | "NOT_CONTROLLING" | "NO_RACE" | "SUSPENDED" | "RATE_LIMITED" };
/** Announcements are facts only; never an envelope, inventory or text snapshot. */
export type BonusAnnouncementPayload = { readonly raceId: string; readonly revision: number; readonly announcement: BonusAnnouncement };

// Browser boundaries: TypeScript wire types do not validate an incoming socket message.
const identifier = z.string().min(1).max(512);
const receiptSchema = z.object({
  id: identifier,
  grant: z.object({ entrantId: identifier, milestone, kind: z.enum(BONUS_KINDS) }).strict(),
  targetId: identifier, at: instant,
}).strict();
export const bonusActivationAckSchema = z.discriminatedUnion("ok", [
  z.object({ ok: z.literal(false), error: z.enum([
    "UNAUTHORIZED", "INVALID_PAYLOAD", "NOT_AN_ENTRANT", "NOT_CONTROLLING", "NO_RACE", "SUSPENDED", "RATE_LIMITED",
  ]) }).strict(),
  z.object({ ok: z.literal(true), self: bonusSelfSchema, result: z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), seq: sequence.min(1), receipt: receiptSchema }).strict(),
    z.object({ ok: z.literal(false), seq: sequence.min(1), reason: z.enum([
      "WRONG_RACE", "NOT_RACING", "INVALID_STATE", "UNKNOWN_ENTRANT", "ENTRANT_TERMINAL",
      "NO_VALID_TARGET", "INVALID_PROTECTED_POSITION", "NO_REMOVABLE_WORD", "INVALID_EXTENSION",
      "TEXT_TOO_LONG", "TEXT_VERSION_EXHAUSTED", "INVALID_TIME", "FOG_ALREADY_ACTIVE",
      "INVALID_INPUT", "BONUSES_DISABLED", "UNKNOWN_GRANT", "GRANT_CONSUMED", "NOT_FIRST_GRANT",
      "SEQUENCE_CONFLICT", "STALE_SEQUENCE", "OUT_OF_ORDER", "SEQUENCE_EXHAUSTED", "CONTENT_UNAVAILABLE",
    ]) }).strict(),
  ]) }).strict(),
]);
export const bonusAnnouncementSchema = z.object({
  raceId: z.uuid(), revision: sequence,
  announcement: z.discriminatedUnion("type", [
    z.object({ type: z.literal("activated"), receipt: receiptSchema }).strict(),
    z.object({ type: z.literal("fogExpired"), id: identifier, entrantId: identifier, at: instant }).strict(),
  ]),
}).strict();
export type ParsedBonusAck = z.infer<typeof bonusActivationAckSchema>;
export type ParsedBonusAnnouncement = z.infer<typeof bonusAnnouncementSchema>;
