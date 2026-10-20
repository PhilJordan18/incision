/** Stable engine IDs. Pirate display titles belong to the translated UI, not these rules. */
export const BOT_LEVELS = ["noob", "beginner", "intermediate", "expert", "impossible"] as const;
export type BotLevel = (typeof BOT_LEVELS)[number];

export type BotProfile = {
  readonly minWpm: number;
  readonly maxWpm: number;
  /** Fraction of all inserts, including mandatory repairs, on a long reference run. */
  readonly errorRate: number;
};

export const BOT_PROFILES: Readonly<Record<BotLevel, BotProfile>> = Object.freeze({
  noob: Object.freeze({ minWpm: 10, maxWpm: 20, errorRate: 0.12 }),
  beginner: Object.freeze({ minWpm: 20, maxWpm: 35, errorRate: 0.08 }),
  intermediate: Object.freeze({ minWpm: 35, maxWpm: 60, errorRate: 0.05 }),
  expert: Object.freeze({ minWpm: 70, maxWpm: 100, errorRate: 0.02 }),
  impossible: Object.freeze({ minWpm: 140, maxWpm: 170, errorRate: 0.005 }),
});

export function botProfile(level: BotLevel): BotProfile {
  if (!BOT_LEVELS.includes(level)) throw new RangeError("Unknown bot level");
  return BOT_PROFILES[level];
}
