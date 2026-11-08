import { checkedBonusJournal, type BonusJournal } from "@incision/database";
import type { BonusRaceState } from "@incision/domain";

/** Called once at the end, never from a client projection or progress percentages. */
export function freezeBonusJournal(state: BonusRaceState, entrantId: string, entrants: readonly { readonly entrantId: string; readonly ordinal: number }[]): BonusJournal {
  if (state.race.phase !== "ended") throw new Error("Bonus journal requires final server state");
  const journal = checkedBonusJournal({ version: 1, grants: state.awards.grants
    .filter((grant) => grant.entrantId === entrantId)
    .map((grant) => {
      const receipts = state.consumed.filter((receipt) => receipt.grant.entrantId === entrantId && receipt.grant.milestone === grant.milestone);
      if (receipts.length > 1) throw new Error("Duplicate bonus receipt");
      const receipt = receipts[0];
      if (receipt !== undefined && (receipt.grant.kind !== grant.kind || receipt.at > (state.race.endedAt ?? -1))) {
        throw new Error("Invalid bonus receipt");
      }
      return { kind: grant.kind, milestone: grant.milestone,
        ...(receipt === undefined ? {} : { activation: {
          targetOrdinal: entrants.find((entrant) => entrant.entrantId === receipt.targetId)?.ordinal,
          atMs: receipt.at - state.race.startsAt,
        } }),
      };
    }),
  }, entrants.map((entrant) => entrant.ordinal));
  for (const grant of journal.grants) {
    if (grant.activation !== undefined) Object.freeze(grant.activation);
    Object.freeze(grant);
  }
  Object.freeze(journal.grants);
  return Object.freeze(journal);
}
