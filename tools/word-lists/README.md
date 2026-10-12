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

- `npm run report -w @incision/word-lists -- <raw-dir>`: the calibration report (Q-1). Counts and
  distributions per language and per proposed level; it decides nothing.
- `npm run bundle-check -w @incision/word-lists -- <client-static-dir> <data-file>... [--fingerprint <word>]...`:
  fails when the sentinel or a fingerprint word of the data reaches a client asset, and never
  passes vacuously (see `src/bundle-check.ts`). Relative paths resolve from where npm runs.
- `npm test -w @incision/word-lists`: the decoder, the bundle check, and the static test that keeps
  the engine's sentinel confined to `packages/domain/src/words/data/`.
