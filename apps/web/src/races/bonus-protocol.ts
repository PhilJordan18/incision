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
}).strict();
export type BonusSelf = z.infer<typeof bonusSelfSchema>;
export type BonusActivationAck =
  | { readonly ok: true; readonly result: ActivationReply; readonly self: BonusSelf }
  | { readonly ok: false; readonly error: "UNAUTHORIZED" | "INVALID_PAYLOAD" | "NOT_AN_ENTRANT" | "NOT_CONTROLLING" | "NO_RACE" | "SUSPENDED" | "RATE_LIMITED" };
/** Announcements are facts only; never an envelope, inventory or text snapshot. */
export type BonusAnnouncementPayload = { readonly raceId: string; readonly revision: number; readonly announcement: BonusAnnouncement };
