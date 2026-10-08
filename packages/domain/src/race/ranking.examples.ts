import type { ContractExample } from "../contract-example";
import { asEntrantId, type EntrantId } from "../ids";
import { asInstant } from "../time";
import type { RankInput } from "./types";

const id = (value: string): EntrantId => asEntrantId(value);
const at = (milliseconds: number) => asInstant(1_000_000 + milliseconds);

/** Executed by F-02.2 against `rankEntrants`; `expected` lists the entrants from rank 1, so ranks are 1 to n. */
export const RANKING_EXAMPLES: readonly ContractExample<readonly RankInput[], readonly EntrantId[]>[] = [
  {
    name: "between finishers, arrival decides, not accuracy",
    input: [
      { entrantId: id("late"), status: "finished", endedAt: at(42_000), position: 100, length: 100, accuracy: 100 },
      { entrantId: id("early"), status: "finished", endedAt: at(41_000), position: 100, length: 100, accuracy: 80 },
    ],
    expected: [id("early"), id("late")],
  },
  {
    name: "finishers, then time-outs by progress, then abandons by progress",
    input: [
      { entrantId: id("quitter"), status: "abandoned", endedAt: at(50_000), position: 95, length: 100, accuracy: 99 },
      { entrantId: id("slow"), status: "timedOut", endedAt: at(60_000), position: 80, length: 100, accuracy: 99 },
      { entrantId: id("winner"), status: "finished", endedAt: at(55_000), position: 100, length: 100, accuracy: 90 },
      { entrantId: id("close"), status: "timedOut", endedAt: at(60_000), position: 90, length: 100, accuracy: 70 },
    ],
    expected: [id("winner"), id("close"), id("slow"), id("quitter")],
  },
  {
    name: "equal progress: higher accuracy first, then the stable id",
    input: [
      { entrantId: id("b"), status: "timedOut", endedAt: at(60_000), position: 25, length: 50, accuracy: 90 },
      { entrantId: id("c"), status: "timedOut", endedAt: at(60_000), position: 50, length: 100, accuracy: 95 },
      { entrantId: id("a"), status: "timedOut", endedAt: at(60_000), position: 50, length: 100, accuracy: 90 },
    ],
    expected: [id("c"), id("a"), id("b")],
  },
  {
    name: "progress compares exactly, without rounding: 1/3 is ahead of 333/1000",
    input: [
      { entrantId: id("rounded"), status: "timedOut", endedAt: at(60_000), position: 333, length: 1_000, accuracy: 100 },
      { entrantId: id("third"), status: "timedOut", endedAt: at(60_000), position: 1, length: 3, accuracy: 100 },
    ],
    expected: [id("third"), id("rounded")],
  },
  {
    name: "a complete tie (status, progress, accuracy) still gives ranks 1 to n: the stable id decides",
    input: [
      { entrantId: id("zed"), status: "finished", endedAt: at(30_000), position: 100, length: 100, accuracy: 97 },
      { entrantId: id("amy"), status: "finished", endedAt: at(30_000), position: 100, length: 100, accuracy: 97 },
      { entrantId: id("kim"), status: "finished", endedAt: at(30_000), position: 100, length: 100, accuracy: 97 },
    ],
    expected: [id("amy"), id("kim"), id("zed")],
  },
  {
    name: "abandons during the countdown (no insert, accuracy 0) fall to the stable id",
    input: [
      { entrantId: id("second"), status: "abandoned", endedAt: at(-1_000), position: 0, length: 100, accuracy: 0 },
      { entrantId: id("first"), status: "abandoned", endedAt: at(-2_000), position: 0, length: 100, accuracy: 0 },
    ],
    expected: [id("first"), id("second")],
  },
];
