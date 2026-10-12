/**
 * Random mode (D-10, Q-1 to Q-9, P-2): words drawn from the pool with the seeded generator.
 *
 * Proven incompatibilities are refused before any draw (`randomContentRefusal`). The draw is then
 * a deterministic, bounded search; when it ends without a solution it says so
 * (`TEXT_SEARCH_EXHAUSTED`), which is never presented as a proof. Words are placed so that every
 * guarantee holds together: no word is ever deleted afterwards.
 */
import { shuffled, type Random } from "../random/prng";
import { buildWordPool, foldForExclusion, forbiddenPairRule, type ForbiddenPairRule } from "../words/pool";
import type { ExclusionList, ForbiddenPairList, WordList, WordPool } from "../words/types";
import { toGraphemes } from "./graphemes";
import { availableMarks, settingCharacter, type ComplexityCriteria, type RandomTextSettings } from "./settings";
import { DIGITS, HARD_TO_TYPE_LETTERS, MARKS, usesWordLetters, type Mark } from "./typable";

export type RandomWords = { readonly list: WordList; readonly exclusions: ExclusionList; readonly pairs: ForbiddenPairList };

export type RandomContentRefusal = "NO_COMPATIBLE_WORDS" | "INCLUDED_CHARACTER_UNAVAILABLE" | "INCLUDED_CHARACTERS_DO_NOT_FIT" | "FORBIDDEN_PAIRS_UNAVOIDABLE";

/** Bounds of the search: whole attempts, draws for one word slot, and greedy covers tried. */
export const SEARCH_ATTEMPTS = 64;
export const DRAWS_PER_SLOT = 32;
export const COVER_ATTEMPTS = 16;

const NO_DIACRITIC = /^[a-z']+$/u;
const TERMINAL: readonly Mark[] = [".", "?", "!"];
const INNER: readonly Mark[] = [",", ";", ":"];
const FRENCH_SPACED: ReadonlySet<string> = new Set([";", ":", "!", "?"]);
const isDigit = (character: string): boolean => DIGITS.includes(character);
const isMark = (character: string): boolean => (MARKS as readonly string[]).includes(character);

type Characters = { readonly include: ReadonlySet<string>; readonly exclude: ReadonlySet<string> };

function charactersOf(settings: RandomTextSettings): Characters {
  const set = (inputs: readonly string[]): ReadonlySet<string> =>
    new Set(inputs.map((input) => settingCharacter(input, settings.language)).filter((character): character is string => character !== undefined));
  return { include: set(settings.include), exclude: set(settings.exclude) };
}

function checkLanguages(settings: RandomTextSettings, words: RandomWords): void {
  if ([words.list.language, words.exclusions.language, words.pairs.language].some((language) => language !== settings.language)) {
    throw new RangeError(`Word data in another language than ${settings.language}`);
  }
}

/** The words a text may draw for these settings: exclusions first (F-02.4), then band, accents and characters. */
export function randomPool(settings: RandomTextSettings, words: RandomWords, criteria: ComplexityCriteria): WordPool {
  checkLanguages(settings, words);
  const { exclude } = charactersOf(settings);
  return buildWordPool({
    list: words.list,
    exclusions: words.exclusions,
    accept: (entry) =>
      toGraphemes(entry.word).length <= criteria.maxLetters &&
      entry.zipf >= criteria.minZipf &&
      usesWordLetters(entry.word, settings.language) &&
      ![...entry.word].some((character) => HARD_TO_TYPE_LETTERS.includes(character) || exclude.has(character)) &&
      (settings.options.accents || NO_DIACRITIC.test(entry.word)),
  });
}

function maxDigitsOf(criteria: ComplexityCriteria): number {
  const digits = String(criteria.maxNumber).length;
  if (!Number.isInteger(criteria.maxNumber) || criteria.maxNumber !== 10 ** digits - 1) {
    throw new RangeError("maxNumber must be 9, 99, 999…");
  }
  return digits;
}

/** Number tokens when numbers are on: about one in ten, at least one, enough to hold the included digits. */
export function numberCount(settings: RandomTextSettings, criteria: ComplexityCriteria): number {
  if (!settings.options.numbers) return 0;
  const included = [...charactersOf(settings).include].filter(isDigit).length;
  return Math.max(1, Math.round(settings.wordCount / 10), Math.ceil(included / maxDigitsOf(criteria)));
}

/** Whether no two different pool words may ever be neighbours, while numbers cannot separate them all. */
function pairsUnavoidable(words: readonly string[], pairs: ForbiddenPairList, rule: ForbiddenPairRule, wordSlots: number, numbers: number): boolean {
  if (words.length < 2 || wordSlots <= numbers + 1) return false;
  const paired = new Set(pairs.pairs.flatMap((pair) => pair.map(foldForExclusion)));
  if (words.some((word) => !paired.has(foldForExclusion(word)))) return false;
  for (let first = 0; first < words.length; first += 1) {
    for (let second = first + 1; second < words.length; second += 1) {
      if (!rule(words[first] ?? "", words[second] ?? "")) return false;
    }
  }
  return true;
}

/** Proven incompatibilities of the content, without drawing; undefined when a search may succeed. */
export function randomContentRefusal(settings: RandomTextSettings, words: RandomWords, criteria: ComplexityCriteria): RandomContentRefusal | undefined {
  const pool = randomPool(settings, words, criteria).entries.map((entry) => entry.word);
  if (pool.length === 0) return "NO_COMPATIBLE_WORDS";
  const letters = [...charactersOf(settings).include].filter((character) => !isDigit(character) && !isMark(character));
  if (letters.some((letter) => !pool.some((word) => word.includes(letter)))) return "INCLUDED_CHARACTER_UNAVAILABLE";
  const wordSlots = settings.wordCount - numberCount(settings, criteria);
  const mostPerWord = Math.max(...pool.map((word) => letters.filter((letter) => word.includes(letter)).length));
  if (letters.length > 0 && Math.ceil(letters.length / mostPerWord) > wordSlots) return "INCLUDED_CHARACTERS_DO_NOT_FIT";
  if (pairsUnavoidable(pool, words.pairs, forbiddenPairRule(words.pairs), wordSlots, numberCount(settings, criteria))) return "FORBIDDEN_PAIRS_UNAVOIDABLE";
  return undefined;
}

/** A seeded greedy cover: words that hold every included letter, each adding at least one. */
function greedyCover(pool: readonly string[], letters: readonly string[], random: Random): string[] {
  const useful = pool.filter((word) => letters.some((letter) => word.includes(letter)));
  const uncovered = new Set(letters);
  const chosen: string[] = [];
  while (uncovered.size > 0) {
    let best = 0;
    let candidates: string[] = [];
    for (const word of useful) {
      const gain = [...uncovered].filter((letter) => word.includes(letter)).length;
      if (gain > best) {
        best = gain;
        candidates = [word];
      } else if (gain === best && gain > 0) {
        candidates.push(word);
      }
    }
    const pick = candidates[random.index(candidates.length)] ?? "";
    chosen.push(pick);
    for (const letter of [...uncovered]) {
      if (pick.includes(letter)) uncovered.delete(letter);
    }
  }
  return chosen;
}

/** Integers without separators, below maxNumber, from the allowed digits, holding every included digit. */
function drawNumbers(count: number, required: readonly string[], allowed: readonly string[], maxDigits: number, random: Random): string[] {
  const pending = [...required];
  return Array.from({ length: count }, () => {
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

/** Places the cover words, the numbers and the drawn words so that no two neighbouring words clash. */
function arrange(cover: readonly string[], numbers: readonly string[], fill: number, pool: readonly string[], rule: ForbiddenPairRule, random: Random): Token[] | undefined {
  const repeatsAllowed = pool.length < 2;
  const fits = (left: Token | null | undefined, right: Token | null | undefined): boolean =>
    left?.kind !== "word" || right?.kind !== "word" || ((repeatsAllowed || left.word !== right.word) && !rule(left.word, right.word));
  for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt += 1) {
    const slots: (Token | null)[] = shuffled<Token | null>(
      [...cover.map((word): Token => ({ kind: "word", word })), ...numbers.map((value): Token => ({ kind: "number", value })), ...Array.from({ length: fill }, () => null)],
      random,
    );
    // A sentence starts with a word (Q-2): never let a number open the text.
    const firstNotNumber = slots.findIndex((slot) => slot?.kind !== "number");
    if (firstNotNumber > 0) {
      [slots[0], slots[firstNotNumber]] = [slots[firstNotNumber] ?? null, slots[0] ?? null];
    }
    let placed = true;
    for (let index = 0; index < slots.length && placed; index += 1) {
      if (slots[index] !== null) continue;
      placed = false;
      for (let draw = 0; draw < DRAWS_PER_SLOT; draw += 1) {
        const candidate: Token = { kind: "word", word: pool[random.index(pool.length)] ?? "" };
        if (fits(slots[index - 1], candidate) && fits(candidate, slots[index + 1])) {
          slots[index] = candidate;
          placed = true;
          break;
        }
      }
    }
    if (placed && slots.every((slot, index) => index === 0 || fits(slots[index - 1], slot))) {
      return slots as Token[];
    }
  }
  return undefined;
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
  const candidates = tokens.map((token, index) => (token.kind === "word" && index > 0 && !starts.includes(index) ? index : -1)).filter((index) => index > 0);
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
  const take = (): number | undefined => gaps.pop();
  for (const mark of inner.filter((candidate) => included.has(candidate))) {
    const gap = take();
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
  const wordIndexes = shuffled(tokens.map((token, index) => (token.kind === "word" ? index : -1)).filter((index) => index >= 0), random);
  for (const mark of new Set([...wantedWrappers, ...optionalWrapper])) {
    const index = wordIndexes.pop();
    if (index !== undefined && mark !== undefined) wrap[index] = mark;
  }
  if (marks.length > 0 && !after.some((mark) => mark !== undefined) && !wrap.some((mark) => mark !== undefined)) {
    // Punctuation on means at least one mark (Q-3).
    const gap = take();
    if (inner.length > 0 && gap !== undefined) after[gap] = inner[0];
    else wrap[wordIndexes.pop() ?? 0] = wrappers[0];
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

/**
 * One random text for settings already checked by `textSettingsRefusal` and `randomContentRefusal`.
 * The caller asserts the invariants on the result.
 */
export function drawRandomText(settings: RandomTextSettings, words: RandomWords, criteria: ComplexityCriteria, random: Random): RandomDraw {
  const pool = randomPool(settings, words, criteria).entries.map((entry) => entry.word);
  const rule = forbiddenPairRule(words.pairs);
  const { include, exclude } = charactersOf(settings);
  const letters = [...include].filter((character) => !isDigit(character) && !isMark(character));
  const numbers = numberCount(settings, criteria);
  const wordSlots = settings.wordCount - numbers;
  let cover: string[] | undefined;
  for (let attempt = 0; attempt < COVER_ATTEMPTS && cover === undefined; attempt += 1) {
    const candidate = greedyCover(pool, letters, random);
    if (candidate.length <= wordSlots) cover = candidate;
  }
  if (cover === undefined) {
    return { ok: false, reason: "TEXT_SEARCH_EXHAUSTED" };
  }
  const allowedDigits = [...DIGITS].filter((digit) => !exclude.has(digit));
  const drawn = drawNumbers(numbers, [...include].filter(isDigit), allowedDigits, numbers > 0 ? maxDigitsOf(criteria) : 1, random);
  const tokens = arrange(cover, drawn, wordSlots - cover.length, pool, rule, random);
  if (tokens === undefined) {
    return { ok: false, reason: "TEXT_SEARCH_EXHAUSTED" };
  }
  return { ok: true, text: render(tokens, settings, criteria, include, random), poolSize: pool.length };
}
