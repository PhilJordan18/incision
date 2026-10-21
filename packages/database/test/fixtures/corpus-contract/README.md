# Corpus contract fixture (tests only)

Not the corpus. A fixture written by session A to test the import contract of F-02.3a
(`src/corpus/`): one version, `contract-2026-10-21`, holding the two passages already shipped in
`apps/web/src/server/races/race-texts.ts` (same ids, same typed text), with their exact source text
and the provenance, measures and editorial notes recorded in session B's registry on October 12.

- The measures were taken by B with normalisation version 1 (`measuredWith.normalizationVersion: 1`);
  the real corpus versions are measured again with version 2 by B before they are written.
- The tests build every broken variant (unknown field, wrong normalisation, conflicts…) from this
  fixture in code; nothing edits it.
- The real corpus lives in `packages/database/corpus/<version>/`, authored by session B.
