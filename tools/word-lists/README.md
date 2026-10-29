# @incision/word-lists — preparing the random-mode word lists (F-02.4)

A local tool, never part of the release or the browser bundle. All its dependencies are dev
dependencies; apart from the usual tooling, the only one is `@msgpack/msgpack` 3.1.3. The engine
keeps its purity guard: the lists reach `packages/domain` as generated data only, on the
server-only subpath `@incision/domain/words`.

## Pinned inputs

The raw inputs are downloaded once, by hand, and kept **outside** the repository. Nothing derived
from them is committed until their packaging, licences and attributions have been reviewed.

| Input | Pinned source | SHA-256 | Licence |
|---|---|---|---|
| wordfreq 3.1.1 wheel | https://files.pythonhosted.org/packages/24/61/62835c475d69872d30689f284497853fe33fe1d6dd18f57346d13305861d/wordfreq-3.1.1-py3-none-any.whl (equal to the digest PyPI publishes) | `4b1c6ecffc6198be3396d5cf871c4423ca71c907c231348d352dd54d62b97473` | code Apache-2.0; data CC BY-SA 4.0 with the credits of its README (SUBTLEX, OpenSubtitles, Google Books…) |
| `wordfreq/data/large_fr.msgpack.gz` (from the wheel) | idem | `6f16cd80b9b66c5698ed002becea83ae30d0584c3205f1cf01714ad562c00c8b` | idem |
| `wordfreq/data/large_en.msgpack.gz` (from the wheel) | idem | `dffae8066b78dce0a6667cf5f58e567054f902674667090a7ac8a8a44628b05c` | idem |
| LDNOOBW `fr` | https://github.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words at commit `5faf2ba42d7b1c0977169ec3611df25a3c08eb13` | `79763a705e08256b393952852bb63aa903f4485e0ef02f70735f5e50efff213c` | CC BY 4.0 |
| LDNOOBW `en` | idem | `af851ecef1d5f212caba17339b12ac39cc2fef7d78c74876f67237644fcee8bd` | CC BY 4.0 |

Lay them out as `<raw-dir>/wordfreq-3.1.1/wordfreq/data/large_{fr,en}.msgpack.gz` and
`<raw-dir>/ldnoobw-5faf2ba/{fr,en}`. The tool checks each file against its pinned SHA-256
(`src/pinned.ts`) before reading it and fails closed on a mismatch; decompression stops at 64 MiB.

## Commands

### Candidate export (F-02.4A)

```sh
npm run export:candidate -w @incision/word-lists -- --raw-dir /absolute/raw --language fr --version candidate-1 --out-dir /absolute/new-candidate
```

Use explicit absolute directories: npm runs this command inside the tool workspace.
The output parent must already exist; the output directory must not exist. The command
reads only the selected pinned wordfreq file: LDNOOBW, Lexique and ESDB are not needed.
There is no network access, arbitrary pin override or change to the runtime's `fixture-1` lists.

The output contains `<language>.words.txt`, `manifest.json`, `NOTICE.txt` and the complete
upstream excerpt `wordfreq-3.1.1.md` (see [provenance](notices/README.md)). The manifest
records input/output SHA-256, source and exporter/policy versions, transformations and counts.
It has no timestamp or absolute path, so identical inputs/options produce identical bytes.
The policy uses NFC, lowercase then NFC; rejects non-NFKC-stable forms, unsupported syntax
and letters outside the existing language alphabet; keeps the maximum Zipf on normalized
collisions; and sorts equal-frequency words by UTF-16 code units, without locale dependence.
Bins use integer `900 - binIndex` to avoid floating-point serialization. Unsupported entries
are counted by first rejection reason (frequency, syntax, alphabet). Input count equals unique
accepted words + duplicates + rejected words. Empty candidates are refused.

This is a **syntactic candidate**, not a reviewed linguistic list or a safe list for minors.
It deliberately does not choose difficulty thresholds, apply exclusions/pairs, transliterate
ligatures, or choose an auxiliary dictionary. French ligatures remain spelled as supplied;
the existing random generator's typing restrictions still apply later. Full upstream credits
are copied from the pinned wheel's `wordfreq-3.1.1.dist-info/METADATA`; review/retain those and resolve
editorial policy before publishing actual data. Do not commit the generated real lists.

Validation and serialization finish before writing. A sibling `<out-dir>.lock` serializes
exporter writers; files are staged in a temporary sibling directory then renamed together.
An existing destination (including an empty directory or symlink) is refused. Use a private
output parent; unrelated programs must not create/replace that destination during publication.
Errors clean up only this invocation's staging directory/lock. An externally killed process
can leave a lock/staging directory: inspect ownership before manually removing either.

Tests use synthetic packs with injected test pins. The CLI always uses the production pins.
Verify real-file runs separately; their success does not constitute editorial acceptance.

### Existing tools

- `npm run report -w @incision/word-lists -- <raw-dir>`: the calibration report (Q-1). Counts and
  distributions per language and per proposed level; it decides nothing.
- `npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>... [--fingerprint <word>]...`:
  fails when the sentinel or a fingerprint word of the data reaches a client asset, and never
  passes vacuously (see `src/bundle-check.ts`). Relative paths resolve from where npm runs.
- `npm test -w @incision/word-lists`: the decoder, the bundle check, and the static test that keeps
  the engine's sentinel confined to `packages/domain/src/words/data/`.
