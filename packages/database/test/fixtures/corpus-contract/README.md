# Corpus contract fixture (tests only)

Not the corpus. A fixture written by session A to test the import contract of F-02.3a
(`src/corpus/`): one version, `contract-2026-10-21`, holding the two passages already shipped in
`apps/web/src/server/races/race-texts.ts` (same ids, same typed text), with their exact source text
and the provenance, measures and editorial notes recorded in session B's registry on October 12.

- **Measures.** B measured these two passages on October 12 under normalisation version 1. The
  import requires measures taken under the corpus's own version (2, Philippe's decision of
  October 21). These two texts are identical under versions 1 and 2 (no ligature, the only change
  of version 2), and the measures are computed on the normalised text, so the values are the same;
  the fixture declares version 2 on that ground. B's real versions are measured again with version 2.
- **Format.** Each file is written as `JSON.stringify(value, null, 2)` and a newline, as the import
  requires.
- The tests build every broken variant (unknown field, wrong normalisation, conflicts…) from this
  fixture in code; nothing edits it. Import it only into disposable test databases.
- The real corpus lives in `packages/database/corpus/<version>/`, authored by session B.
