import { RACE_MIN_PARTICIPANTS } from "./limits";

/** A runner: a person (account or guest) or a bot. Spectators never race. */
export const ENTRANT_KINDS = ["human", "bot"] as const;
export type EntrantKind = (typeof ENTRANT_KINDS)[number];

export type StartRefusal = "NOT_ENOUGH_PARTICIPANTS" | "NO_HUMAN_PARTICIPANT";

/**
 * Why the host cannot start the race, or undefined when they can (COURSE-02): at least two
 * participants, at least one of them human; bots count toward the minimum. Pass the room's
 * participants only, read under the room lock: spectators are never entrants.
 * `createRace` applies the same rule, so the room and the race cannot disagree.
 */
export function startRefusal(participants: readonly { readonly kind: EntrantKind }[]): StartRefusal | undefined {
  if (participants.length < RACE_MIN_PARTICIPANTS) {
    return "NOT_ENOUGH_PARTICIPANTS";
  }
  if (!participants.some((participant) => participant.kind === "human")) {
    return "NO_HUMAN_PARTICIPANT";
  }
  return undefined;
}
