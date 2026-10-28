import { type ActiveCorpus, defaultCoherentSettings, describeDatabaseError } from "@incision/database";
import {
  asRandomState,
  type CoherentTextSettings,
  generateRaceText,
  passageCut,
  type RandomState,
  type RaceTextVersions,
  TEXT_LANGUAGES,
  type TextLanguage,
} from "@incision/domain";

/** A fixed race text: the short test fixtures only. */
export type RaceText = {
  /** Recorded with each race (its configuration snapshot). */
  readonly id: string;
  readonly text: string;
};

type TextRecordBase = {
  /** The text's language, decided by the server at the start and kept with the race (CONF-02). */
  readonly language: TextLanguage;
  /** The passage id (`config_snapshot.text`), `fixture` for the test texts; the typed text is `text_snapshot`. */
  readonly text: string;
};

/**
 * What a race keeps of its text in its configuration snapshot, next to `text_snapshot` (the exact
 * text typed). A fixed text records its id only, as since F-04.0; a corpus draw adds the version
 * it came from and what produced the cut, so that the passage's provenance is found in
 * `race_passages`.
 */
export type RaceTextRecord =
  | (TextRecordBase & { readonly corpusVersion?: never; readonly textSettings?: never; readonly textVersions?: never })
  | (TextRecordBase & { readonly corpusVersion: string; readonly textSettings: CoherentTextSettings; readonly textVersions: RaceTextVersions });

export type RaceTextDraw =
  | { readonly ok: true; readonly text: string; readonly record: RaceTextRecord }
  /** No race is written. NO_COMPATIBLE_PASSAGE: nothing in the corpus serves the settings (or no corpus is active). */
  | { readonly ok: false; readonly reason: "NO_COMPATIBLE_PASSAGE" | "UNAVAILABLE" };

/**
 * TEST FIXTURES, short, for the local production builds of the E2E and integration tests
 * (RACE_FIXTURE_TEXTS=allowed, refused on a deployed site). Never production texts: any other
 * server draws from the corpus (CorpusTexts).
 */
export const FIXTURE_RACE_TEXTS: Readonly<Record<TextLanguage, RaceText>> = {
  fr: { id: "fixture", text: "Texte de test : la mer est calme, le vent se lève." },
  en: { id: "fixture", text: "Test text: the sea is calm and the wind rises." },
};

/** Where the races of this process take their texts: the corpus, or fixed texts in tests. */
export type RaceTextSource = {
  draw(language: TextLanguage, wordCount: number): Promise<RaceTextDraw>;
};

/** Fixed texts, whole, one per language: the test fixtures follow no setting. */
export function fixedRaceTexts(texts: Readonly<Record<TextLanguage, RaceText>>): RaceTextSource {
  return {
    draw: async (language) => {
      const { id, text } = texts[language];
      return { ok: true, text, record: { language, text: id } };
    },
  };
}

export type CorpusTextsOptions = {
  /** Reads the active version (loadActiveCorpus); undefined while none is imported. */
  readonly load: () => Promise<ActiveCorpus | undefined>;
  /** A fresh state for each draw: four uint32 from crypto (Q-15). Tests pass fixed values. */
  readonly seed?: () => RandomState;
  /** Milliseconds for the retry delay (default `performance.now`). */
  readonly monotonic?: () => number;
  readonly log: (message: string) => void;
  readonly logError: (message: string) => void;
};

/**
 * A read that found no active version, or failed, is not repeated sooner: the starts in between get
 * the same answer. It bounds what starts can make the database do while the corpus is missing or
 * broken (since F-03.1a, only the host of a waiting room gets as far as a draw).
 */
export const CORPUS_RETRY_MS = 10_000;

const cryptoSeed = (): RandomState => asRandomState(Array.from(crypto.getRandomValues(new Uint32Array(4))));

/**
 * The texts races run (F-02.3b): a passage of the active corpus version, drawn and cut by the
 * engine (`generateRaceText`) with the room's word count and D-19's other defaults. The version is loaded
 * from PostgreSQL once per process, checked against its fingerprints and frozen; a version
 * imported later serves after the next restart (docs/DEPLOYMENT.md). While no version is active,
 * or after a failed load, a start reads again, at most once per CORPUS_RETRY_MS. A refused draw
 * never falls back on other texts.
 */
export class CorpusTexts implements RaceTextSource {
  readonly #options: CorpusTextsOptions;
  #corpus: ActiveCorpus | undefined;
  #loading: Promise<ActiveCorpus | undefined> | undefined;
  /** The last read that served nothing, and its failure, if it failed. */
  #missed: { readonly at: number; readonly failure?: { readonly error: unknown } } | undefined;
  #saidEmpty = false;
  /** The failure last logged: a failure that repeats is logged once, until it changes or the corpus loads. */
  #saidFailure: string | undefined;

  constructor(options: CorpusTextsOptions) {
    this.#options = options;
  }

  /** At boot: loads the corpus now and says what races will draw from; a failure is logged and retried by a later start, at most every CORPUS_RETRY_MS. */
  async warm(): Promise<void> {
    try {
      await this.#active();
    } catch {
      // Logged by #load.
    }
  }

  async draw(language: TextLanguage, wordCount: number): Promise<RaceTextDraw> {
    let corpus: ActiveCorpus | undefined;
    try {
      corpus = await this.#active();
    } catch {
      return { ok: false, reason: "UNAVAILABLE" };
    }
    if (corpus === undefined) {
      return { ok: false, reason: "NO_COMPATIBLE_PASSAGE" };
    }
    const settings = { ...defaultCoherentSettings(language), wordCount };
    try {
      const result = generateRaceText({ settings, passages: corpus.passages, state: (this.#options.seed ?? cryptoSeed)() });
      if (!result.ok) {
        // D-19's defaults pass every settings check: only the corpus can lack a passage.
        if (result.reason !== "NO_COMPATIBLE_PASSAGE") {
          this.#options.logError(`[races] corpus ${corpus.version}: draw refused (${result.reason})`);
        }
        return { ok: false, reason: "NO_COMPATIBLE_PASSAGE" };
      }
      if (result.provenance.kind !== "coherent") {
        throw new RangeError("A coherent request drew a random text");
      }
      return {
        ok: true,
        text: result.text,
        record: { language, text: result.provenance.passageId, corpusVersion: corpus.version, textSettings: settings, textVersions: result.versions },
      };
    } catch (error: unknown) {
      // A broken guarantee is a bug of the engine or of the corpus: no race on that text.
      this.#options.logError(`[races] corpus ${corpus.version}: draw failed: ${error instanceof Error ? error.message : "unknown error"}`);
      return { ok: false, reason: "UNAVAILABLE" };
    }
  }

  #active(): Promise<ActiveCorpus | undefined> {
    if (this.#corpus !== undefined) {
      return Promise.resolve(this.#corpus);
    }
    const missed = this.#missed;
    if (missed !== undefined && this.#now() - missed.at < CORPUS_RETRY_MS) {
      return missed.failure === undefined ? Promise.resolve(undefined) : Promise.reject(missed.failure.error);
    }
    // Starts arriving together share one read.
    this.#loading ??= this.#load().finally(() => {
      this.#loading = undefined;
    });
    return this.#loading;
  }

  async #load(): Promise<ActiveCorpus | undefined> {
    let corpus: ActiveCorpus | undefined;
    try {
      corpus = await this.#options.load();
    } catch (error: unknown) {
      this.#missed = { at: this.#now(), failure: { error } };
      // A database error is described without its parameters; a fingerprint mismatch names only the version or the passage id.
      const described = describeDatabaseError(error);
      if (described !== this.#saidFailure) {
        this.#options.logError(`[races] corpus: load failed, starts refused until it loads: ${described}`);
        this.#saidFailure = described;
      }
      throw error;
    }
    if (corpus === undefined) {
      this.#missed = { at: this.#now() };
      this.#saidFailure = undefined;
      if (!this.#saidEmpty) {
        this.#options.log("[races] corpus: no active version, starts refused until one is imported (docs/DEPLOYMENT.md)");
        this.#saidEmpty = true;
      }
      return undefined;
    }
    this.#corpus = corpus;
    this.#missed = undefined;
    // What a start can draw: the retained passages that serve D-19's defaults in each language.
    const counts = TEXT_LANGUAGES.map((language) => {
      const settings = defaultCoherentSettings(language);
      return `${corpus.passages.filter((passage) => passageCut(passage, settings) !== undefined).length} ${language}`;
    }).join(", ");
    this.#options.log(`[races] corpus ${corpus.version}: ${counts} selectable passages`);
    return corpus;
  }

  #now(): number {
    return (this.#options.monotonic ?? performance.now.bind(performance))();
  }
}
