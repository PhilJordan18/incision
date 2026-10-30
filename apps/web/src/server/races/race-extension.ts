import {
  type BonusContent,
  drawExtensionWords,
  type ExtensionSettings,
  type RandomState,
  type RandomWords,
  type TextLanguage,
  type TextSettings,
} from "@incision/domain";

/** The settings an extension draws with: the race's text settings, characters to exclude only in random mode. */
export function extensionSettings(settings: TextSettings): ExtensionSettings {
  const base = { language: settings.language, complexity: settings.complexity, options: settings.options };
  return settings.kind === "random" ? { ...base, exclude: settings.exclude } : base;
}

/**
 * The extendLeader content of one race (F-02.6, #62): three words from the approved lists, drawn by
 * the engine from the race's private seed and the grant, after the target's current text. The words
 * of a grant and a target text are memoised: the draw is pure but builds the whole pool. No approved
 * list, or a refused draw, gives undefined, which the coordinator turns into CONTENT_UNAVAILABLE
 * without consuming the grant. Only the reason is logged, never a word or the seed.
 */
export function extensionContent(input: {
  readonly settings: TextSettings;
  readonly seed: RandomState;
  readonly words: (language: TextLanguage) => RandomWords | undefined;
  readonly logError: (message: string) => void;
}): BonusContent {
  const settings = extensionSettings(input.settings);
  const memo = new Map<string, readonly string[] | undefined>();
  return ({ race, grant, targetId }) => {
    const target = race.entrants.find((entrant) => entrant.entrantId === targetId);
    if (target === undefined) return undefined;
    const key = `${grant.entrantId}|${grant.milestone}|${targetId}|${target.textVersion}`;
    if (memo.has(key)) return memo.get(key);
    const data = input.words(settings.language);
    let words: readonly string[] | undefined;
    if (data === undefined) {
      input.logError("[races] bonus extension unavailable: no approved word list");
    } else {
      try {
        const draw = drawExtensionWords({
          settings, words: data, target: target.target.join(""), seed: input.seed,
          grant: { raceId: race.raceId, entrantId: grant.entrantId, milestone: grant.milestone },
        });
        if (draw.ok) words = draw.words;
        else input.logError(`[races] bonus extension refused (${draw.reason})`);
      } catch (error: unknown) {
        input.logError(`[races] bonus extension failed: ${error instanceof Error ? error.message : "unknown error"}`);
      }
    }
    memo.set(key, words);
    return words;
  };
}
