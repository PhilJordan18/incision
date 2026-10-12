/**
 * Random mode (D-10, Q-1 to Q-9, P-2): words drawn from the pool with the seeded generator.
 *
 * Proven incompatibilities are refused before any draw (`randomContentRefusal`). The draw is then
 * a deterministic, bounded search; when it ends without a solution it says so
 * (`TEXT_SEARCH_EXHAUSTED`), which is never presented as a proof. Words are placed so that every
 * guarantee holds together: no word is ever deleted afterwards.
 *
 * Two words are "the same" when they are spelled the same ("la" and "là" are two words, Q-7).
 * Forbidden pairs compare folded forms, and a number between two words does not separate them:
 * "sale 12 juif" is as forbidden as "sale juif".
 */
import { shuffled, type Random } from "../random/prng";
import { buildWordPool, foldedEntries, foldForExclusion } from "../words/pool";
import type { ExclusionList, ForbiddenPairList, WordList } from "../words/types";
import { availableMarks, settingCharacter, type ComplexityCriteria, type RandomTextSettings } from "./settings";
import { DIGITS, HARD_TO_TYPE_LETTERS, MARKS, usesWordLetters, type Mark } from "./typable";

export type RandomWords = { readonly list: WordList; readonly exclusions: ExclusionList; readonly pairs: ForbiddenPairList };

export type RandomContentRefusal = "NO_COMPATIBLE_WORDS" | "INCLUDED_CHARACTER_UNAVAILABLE" | "INCLUDED_CHARACTERS_DO_NOT_FIT" | "FORBIDDEN_PAIRS_UNAVOIDABLE";

/** Bounds of the search: greedy covers tried, arrangements per cover, and draws for one word slot. */
export const COVER_ATTEMPTS = 16;
export const ARRANGE_ATTEMPTS = 16;
export const DRAWS_PER_SLOT = 32;

const NO_DIACRITIC = /^[a-z']+$/u;
const TERMINAL: readonly Mark[] = [".", "?", "!"];
const INNER: readonly Mark[] = [",", ";", ":"];
const FRENCH_SPACED: ReadonlySet<string> = new Set([";", ":", "!", "?"]);
const SEPARATOR = String.fromCharCode(0);
const isDigit = (character: string): boolean => DIGITS.includes(character);
const isMark = (character: string): boolean => (MARKS as readonly string[]).includes(character);

/** A pool word with its folded form, for the pair rule. */
type PoolWord = { readonly word: string; readonly folded: string };

/** Everything a draw needs, built once per call from the settings and the data. */
export type RandomPlan = {
  readonly pool: readonly PoolWord[];
  readonly forbidden: ReadonlySet<string>;
  readonly include: ReadonlySet<string>;
  readonly exclude: ReadonlySet<string>;
  readonly letters: readonly string[];
  readonly numbers: number;
  readonly wordSlots: number;
  /** Pool words no other pool word may neighbour: they can only stand alone. */
  readonly isolated: ReadonlySet<string>;
};

const pairKey = (first: string, second: string): string => (first < second ? first + SEPARATOR + second : second + SEPARATOR + first);

/** Whether two words may stand side by side, numbers between them notwithstanding. */
function neighbours(plan: RandomPlan, left: PoolWord, right: PoolWord): boolean {
  return (plan.pool.length < 2 || left.word !== right.word) && !plan.forbidden.has(pairKey(left.folded, right.folded));
}

function charactersOf(settings: RandomTextSettings): { readonly include: ReadonlySet<string>; readonly exclude: ReadonlySet<string> } {
  const set = (inputs: readonly string[]): ReadonlySet<string> =>
    new Set(inputs.map((input) => settingCharacter(input, settings.language)).filter((character): character is string => character !== undefined));
  return { include: set(settings.include), exclude: set(settings.exclude) };
}

/** Numbers when numbers are on: about one token in ten, at least one, enough for the included digits (Q-4). */
function numberCount(settings: RandomTextSettings, criteria: ComplexityCriteria, include: ReadonlySet<string>): number {
  if (!settings.options.numbers) return 0;
  const included = [...include].filter(isDigit).length;
  return Math.max(1, Math.round(settings.wordCount / 10), Math.ceil(included / String(criteria.maxNumber).length));
}

/** The pool and the counts for these settings: exclusions first (F-02.4), then band, accents and characters. */
export function randomPlan(settings: RandomTextSettings, words: RandomWords, criteria: ComplexityCriteria): RandomPlan {
  if ([words.list.language, words.exclusions.language, words.pairs.language].some((language) => language !== settings.language)) {
    throw new RangeError(`Word data in another language than ${settings.language}`);
  }
  const { include, exclude } = charactersOf(settings);
  const folded = foldedEntries(words.list);
  const foldedOf = new Map(words.list.entries.map((entry, index) => [entry.word, folded[index] ?? ""]));
  // List words are NFC letters of an explicit alphabet: one code point is one grapheme.
  const entries = buildWordPool({
    list: words.list,
    exclusions: words.exclusions,
    accept: (entry) =>
      [...entry.word].length <= criteria.maxLetters &&
      entry.zipf >= criteria.minZipf &&
      usesWordLetters(entry.word, settings.language) &&
      ![...entry.word].some((character) => HARD_TO_TYPE_LETTERS.includes(character) || exclude.has(character)) &&
      (settings.options.accents || NO_DIACRITIC.test(entry.word)),
  }).entries;
  const numbers = numberCount(settings, criteria, include);
  const pool = entries.map((entry) => ({ word: entry.word, folded: foldedOf.get(entry.word) ?? foldForExclusion(entry.word) }));
  const forbidden = new Set(words.pairs.pairs.map(([first, second]) => pairKey(foldForExclusion(first), foldForExclusion(second))));
  return {
    pool,
    forbidden,
    include,
    exclude,
    letters: [...include].filter((character) => !isDigit(character) && !isMark(character)),
    numbers,
    wordSlots: settings.wordCount - numbers,
    isolated: isolatedWords(pool, forbidden),
  };
}

/** Pool words with no allowed neighbour. Only words of a forbidden pair can be isolated, so this stays cheap. */
function isolatedWords(pool: readonly PoolWord[], forbidden: ReadonlySet<string>): ReadonlySet<string> {
  if (pool.length < 2) return new Set();
  const paired = new Set([...forbidden].flatMap((key) => key.split(SEPARATOR)));
  const allowed = (left: PoolWord, right: PoolWord): boolean => left.word !== right.word && !forbidden.has(pairKey(left.folded, right.folded));
  return new Set(pool.filter((word) => paired.has(word.folded) && !pool.some((other) => allowed(word, other))).map((word) => word.word));
}

/**
 * Whether the forbidden pairs make any text impossible: every pool word is isolated, or an included
 * letter is held by isolated words only. Numbers cannot separate two words, so an isolated word can
 * only stand in a one-word text.
 */
function pairsUnavoidable(plan: RandomPlan): boolean {
  if (plan.pool.length < 2 || plan.wordSlots < 2) return false;
  if (plan.pool.every((word) => plan.isolated.has(word.word))) return true;
  return plan.letters.some((letter) => plan.pool.every((word) => !word.word.includes(letter) || plan.isolated.has(word.word)));
}

/**
 * Proven incompatibilities of the content, without drawing; undefined when a search may succeed.
 * The proofs hold under the documented number rule (about one token in ten, Q-4).
 */
export function randomContentRefusal(plan: RandomPlan): RandomContentRefusal | undefined {
  if (plan.pool.length === 0) return "NO_COMPATIBLE_WORDS";
  if (plan.letters.some((letter) => !plan.pool.some((word) => word.word.includes(letter)))) return "INCLUDED_CHARACTER_UNAVAILABLE";
  let mostPerWord = 0;
  for (const word of plan.pool) {
    mostPerWord = Math.max(mostPerWord, plan.letters.filter((letter) => word.word.includes(letter)).length);
  }
  if (plan.wordSlots < 1 || (plan.letters.length > 0 && Math.ceil(plan.letters.length / mostPerWord) > plan.wordSlots)) return "INCLUDED_CHARACTERS_DO_NOT_FIT";
  if (pairsUnavoidable(plan)) return "FORBIDDEN_PAIRS_UNAVOIDABLE";
  return undefined;
}

/**
 * A seeded cover of the included letters; undefined if a letter cannot be covered. Greedy picks the
 * words adding the most letters; once greedy covers have failed, any word adding one will do, so a
 * word that suits no neighbour can be avoided.
 */
function cover(plan: RandomPlan, greedy: boolean, random: Random): PoolWord[] | undefined {
  const placeable = plan.wordSlots < 2 ? plan.pool : plan.pool.filter((word) => !plan.isolated.has(word.word));
  const holders = placeable
    .map((word) => ({ word, letters: plan.letters.flatMap((letter, index) => (word.word.includes(letter) ? [index] : [])) }))
    .filter((candidate) => candidate.letters.length > 0);
  const uncovered = plan.letters.map(() => true);
  let left = plan.letters.length;
  const chosen: PoolWord[] = [];
  while (left > 0) {
    let best = 0;
    let candidates: PoolWord[] = [];
    for (const holder of holders) {
      let gain = 0;
      for (const index of holder.letters) gain += uncovered[index] ? 1 : 0;
      if (gain > 0 && !greedy) {
        best = 1;
        candidates.push(holder.word);
      } else if (gain > best) {
        best = gain;
        candidates = [holder.word];
      } else if (gain === best && gain > 0) {
        candidates.push(holder.word);
      }
    }
    if (best === 0) return undefined;
    const pick = candidates[random.index(candidates.length)] as PoolWord;
    chosen.push(pick);
    plan.letters.forEach((letter, index) => {
      if (uncovered[index] && pick.word.includes(letter)) {
        uncovered[index] = false;
        left -= 1;
      }
    });
  }
  return chosen;
}

/** The word sequence: cover words at seeded places, drawn words around them, no clash anywhere. */
function arrangeWords(plan: RandomPlan, cover: readonly PoolWord[], random: Random): PoolWord[] | undefined {
  for (let attempt = 0; attempt < ARRANGE_ATTEMPTS; attempt += 1) {
    const slots = shuffled<PoolWord | undefined>([...cover, ...Array.from({ length: plan.wordSlots - cover.length }, (): PoolWord | undefined => undefined)], random);
    let placed = true;
    for (let index = 0; index < slots.length && placed; index += 1) {
      if (slots[index] !== undefined) continue;
      placed = false;
      const left = slots[index - 1];
      const right = slots[index + 1];
      for (let draw = 0; draw < DRAWS_PER_SLOT; draw += 1) {
        const candidate = plan.pool[random.index(plan.pool.length)] as PoolWord;
        if ((left === undefined || neighbours(plan, left, candidate)) && (right === undefined || neighbours(plan, candidate, right))) {
          slots[index] = candidate;
          placed = true;
          break;
        }
      }
    }
    const words = slots.filter((slot): slot is PoolWord => slot !== undefined);
    if (placed && words.length === slots.length && words.every((word, index) => index === 0 || neighbours(plan, words[index - 1] as PoolWord, word))) {
      return words;
    }
  }
  return undefined;
}

/** Integers without separators, up to maxNumber, from the allowed digits, holding every included digit. */
function drawNumbers(plan: RandomPlan, maxDigits: number, random: Random): string[] {
  const pending = [...plan.include].filter(isDigit);
  const allowed = [...DIGITS].filter((digit) => !plan.exclude.has(digit));
  return Array.from({ length: plan.numbers }, () => {
    const length = Math.max(Math.min(pending.length, maxDigits), 1 + random.index(maxDigits));
    const digits = pending.splice(0, Math.min(pending.length, length));
    while (digits.length < length) {
      digits.push(allowed[random.index(allowed.length)] ?? "0");
    }
    const mixed = shuffled(digits, random);
    const lead = mixed.findIndex((digit) => digit !== "0");
    // No leading zero: a non-zero digit goes first; only zeros make "0", which still holds the zero.
    return lead === -1 ? "0" : [mixed[lead], ...mixed.filter((_, index) => index !== lead)].join("");
  });
}

type Token = { readonly kind: "word"; readonly word: string } | { readonly kind: "number"; readonly value: string };

/** Numbers inserted at seeded places, never first: a sentence starts with a word (Q-2). */
function withNumbers(words: readonly PoolWord[], numbers: readonly string[], random: Random): Token[] {
  const tokens: Token[] = words.map((word) => ({ kind: "word", word: word.word }));
  for (const value of numbers) {
    tokens.splice(1 + random.index(tokens.length), 0, { kind: "number", value });
  }
  return tokens;
}

/** Sentence starts: lengths from the complexity's range, each start on a word, at least `minimum` sentences. */
function sentenceStarts(tokens: readonly Token[], [shortest, longest]: readonly [number, number], minimum: number, random: Random): number[] {
  const starts = [0];
  let next = shortest + random.index(longest - shortest + 1);
  while (next < tokens.length) {
    while (next < tokens.length && tokens[next]?.kind !== "word") next += 1;
    if (next < tokens.length) starts.push(next);
    next += shortest + random.index(longest - shortest + 1);
  }
  const candidates = tokens.flatMap((token, index) => (token.kind === "word" && index > 0 && !starts.includes(index) ? [index] : []));
  for (const extra of shuffled(candidates, random)) {
    if (starts.length >= minimum) break;
    starts.push(extra);
  }
  return starts.sort((a, b) => a - b);
}

/** Sentences, marks and capitals around the arranged tokens, then the final text. */
function render(tokens: readonly Token[], settings: RandomTextSettings, criteria: ComplexityCriteria, included: ReadonlySet<string>, random: Random): string {
  const marks = settings.options.punctuation ? availableMarks(settings, criteria) : [];
  const terminal = TERMINAL.filter((mark) => marks.includes(mark));
  const inner = INNER.filter((mark) => marks.includes(mark));
  const wantedTerminal = terminal.filter((mark) => included.has(mark));
  const starts = sentenceStarts(tokens, criteria.sentenceTokens, Math.max(1, wantedTerminal.length), random);
  const ends = starts.map((start, index) => (starts[index + 1] ?? tokens.length) - 1);
  const after: (Mark | undefined)[] = tokens.map((): Mark | undefined => undefined);
  const wrap: (Mark | undefined)[] = tokens.map((): Mark | undefined => undefined);
  if (terminal.length > 0) {
    const order = shuffled(ends, random);
    wantedTerminal.forEach((mark, index) => (after[order[index] ?? 0] = mark));
    for (const end of ends) {
      after[end] ??= terminal.includes(".") && random.index(10) < 7 ? "." : terminal[random.index(terminal.length)];
    }
  }
  const gaps = shuffled(tokens.map((_, index) => index).filter((index) => !ends.includes(index)), random);
  for (const mark of inner.filter((candidate) => included.has(candidate))) {
    const gap = gaps.pop();
    if (gap !== undefined) after[gap] = mark;
  }
  if (inner.includes(",")) {
    for (const [index, start] of starts.entries()) {
      if ((ends[index] ?? 0) - start >= 4 && random.index(100) < 35) {
        const gap = gaps.find((candidate) => candidate >= start && candidate < (ends[index] ?? 0) && after[candidate] === undefined);
        if (gap !== undefined) after[gap] = ",";
      }
    }
  }
  const wrappers = (['"', "("] as const).filter((mark) => marks.includes(mark));
  const wantedWrappers = wrappers.filter((mark) => included.has(mark) || (mark === "(" && included.has(")")));
  const optionalWrapper = settings.complexity === "hard" && wrappers.length > 0 && random.index(100) < 20 ? [wrappers[random.index(wrappers.length)]] : [];
  const wordIndexes = shuffled(tokens.flatMap((token, index) => (token.kind === "word" ? [index] : [])), random);
  for (const mark of new Set([...wantedWrappers, ...optionalWrapper])) {
    const index = wordIndexes.pop();
    if (index !== undefined && mark !== undefined) wrap[index] = mark;
  }
  if (marks.length > 0 && !after.some((mark) => mark !== undefined) && !wrap.some((mark) => mark !== undefined)) {
    // Punctuation on means at least one mark (Q-3); availableMarks keeps an inner mark or a wrapper here.
    const gap = gaps.pop();
    if (inner.length > 0 && gap !== undefined) after[gap] = inner[0];
    else if (wrappers.length > 0) wrap[wordIndexes.pop() ?? 0] = wrappers[0];
  }
  return tokens
    .map((token, index) => {
      let core = token.kind === "word" ? token.word : token.value;
      if (settings.options.capitals && starts.includes(index)) {
        core = core.charAt(0).toUpperCase() + core.slice(1);
      }
      const open = wrap[index];
      const wrapped = open === undefined ? core : open === "(" ? `(${core})` : `"${core}"`;
      const mark = after[index];
      if (mark === undefined) return wrapped;
      return settings.language === "fr" && FRENCH_SPACED.has(mark) ? `${wrapped} ${mark}` : `${wrapped}${mark}`;
    })
    .join(" ");
}

export type RandomDraw = { readonly ok: true; readonly text: string; readonly poolSize: number } | { readonly ok: false; readonly reason: "TEXT_SEARCH_EXHAUSTED" };

/** One random text for a plan with no content refusal. The caller checks the invariants on the result. */
export function drawRandomText(plan: RandomPlan, settings: RandomTextSettings, criteria: ComplexityCriteria, random: Random): RandomDraw {
  for (let attempt = 0; attempt < COVER_ATTEMPTS; attempt += 1) {
    // The cover is redrawn with each attempt, greedy for the first half: a cover word may suit no neighbour.
    const covering = cover(plan, attempt < COVER_ATTEMPTS / 2, random);
    if (covering === undefined) break;
    if (covering.length > plan.wordSlots) continue;
    const words = arrangeWords(plan, covering, random);
    if (words === undefined) continue;
    const tokens = withNumbers(words, drawNumbers(plan, String(criteria.maxNumber).length, random), random);
    return { ok: true, text: render(tokens, settings, criteria, plan.include, random), poolSize: plan.pool.length };
  }
  return { ok: false, reason: "TEXT_SEARCH_EXHAUSTED" };
}
