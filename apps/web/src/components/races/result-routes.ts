import type { EntrantResultView } from "@incision/database";
import { type RouteStyle, routeStyles } from "./track-layout";

/**
 * A result entrant, with the race entrant id the track knew it by when the projection carries it.
 * The id never reaches the page: it only selects the route style, on the server.
 */
export type ResultEntrant = EntrantResultView & { readonly entrantId?: string };

/**
 * Each entrant's route style after the race, by ordinal: the track's own assignment
 * (`routeStyles`, never a second mapping), so a pennant here has the colour and dash of that
 * runner's route during the race, as the reader saw it (their own route is `moi`).
 *
 * The track assigns by race entrant id. Where the projection does not carry the ids, only the
 * reader's own style is known (always `moi`, solid): the others get no entry, and their pennant
 * shows the shape without claiming a colour.
 */
export function resultRoutes(entrants: readonly ResultEntrant[]): ReadonlyMap<number, RouteStyle> {
  const self = entrants.find((entrant) => entrant.isSelf);
  const identified = entrants.every((entrant) => entrant.entrantId !== undefined);
  // Without ids, the reader stands alone in the assignment: the same function, the same `moi`.
  const known = identified ? entrants : self === undefined ? [] : [self];
  const id = (entrant: ResultEntrant) => entrant.entrantId ?? `ordinal-${entrant.ordinal}`;
  const styles = routeStyles(known.map((entrant) => ({ entrantId: id(entrant) })), self === undefined ? null : id(self));
  return new Map(known.map((entrant) => [entrant.ordinal, styles.get(id(entrant))!]));
}
