import { BONUS_KINDS, BONUS_MILESTONES } from "@incision/domain";
import { z } from "zod";

const shape = z.strictObject({
  version: z.literal(1),
  grants: z.array(z.strictObject({
    kind: z.enum(BONUS_KINDS),
    milestone: z.union(BONUS_MILESTONES.map((value) => z.literal(value))),
    activation: z.strictObject({
      targetOrdinal: z.number().int().min(1).max(32767),
      /** Server receipt time relative to the common start, including pauses. */
      atMs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
    }).optional(),
  })).max(3),
});

/** Race-local ordinals only: no account, membership, session, nickname or receipt ID. */
export type BonusJournal = z.infer<typeof shape>;

export function checkedBonusJournal(input: unknown, ordinals: readonly number[]): BonusJournal {
  const parsed = shape.safeParse(input);
  if (!parsed.success) throw new Error("Invalid bonus journal");
  let previous = 0;
  for (const grant of parsed.data.grants) {
    if (grant.milestone <= previous || (grant.activation !== undefined && !ordinals.includes(grant.activation.targetOrdinal))) {
      throw new Error("Invalid bonus journal");
    }
    previous = grant.milestone;
  }
  return parsed.data;
}
