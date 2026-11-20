# F-08.2 — Language preference weights

Card [#73](https://github.com/PhilJordan18/incision/issues/73), I18N-02. Base `dev` `b14e5d0`; implementation `af5bfe9`. This is a correction to existing request-language negotiation, not a completed all-screen accessibility or translation audit.

## Defect and scope

Without an explicit locale cookie, `en;q=oops,fr;q=0.9` and `en;q=1.5,fr;q=0.9` selected English. The first malformed weight became the default priority of 1; the second was accepted above the permitted maximum. This contradicted the existing resolver's promise to ignore malformed entries.

`apps/web/src/i18n/locale.ts` now distinguishes an absent weight from a malformed one. It accepts one case-insensitive `q` parameter following the [RFC 9110 section 12.4.2 grammar](https://www.rfc-editor.org/rfc/rfc9110.html#section-12.4.2), including `0.`, `1.`, and up to three fractional digits (only zeros after 1). Malformed, duplicate or unsupported parameters exclude that entry. No language-tag matching policy was redesigned.

The valid cookie still wins; regional tags, stable equal-weight order, zero-weight exclusion and French fallback remain. The request dictionary and realtime handshake already call this same resolver. No consumer, dictionary, UI, dependency, database, runtime or shared matrix file changed. The possible effect on the creator's initial language was announced on #45; the other Codex confirmed these two source/test files were unreserved.

## Evidence

`npm test --workspace @incision/web -- src/i18n/locale.test.ts` with the new cases on the old implementation: **7 failed, 20 passed**. After correction: **27 passed**. The cases cover malformed weights, excessive precision, duplicate parameters, uppercase Q, valid boundaries, regional tags, equal-weight ordering and existing cookie/fallback behavior.

Root verification at `af5bfe9`: `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` all passed. Unit total: **1,859** (web 606, database 130, domain 1,056, load 20, word lists 47). The subsequent evidence-only commit does not change executable code.

Local logs: `/tmp/incision73-locale-before.log` and `/tmp/incision73-locale-verification.log`. Root checks ran under the shared `heavy.sh` lock. No local browser suite or PostgreSQL integration suite was rerun for this pure parser correction; no production claim is made.

## Reviews at af5bfe9

- Code reviewer (sequential read-only role): no blocking or major finding. The anchored, bounded weight pattern follows the linked grammar; invalid entries cannot become maximum priority. No dependency or API change.
- Functional QA (sequential read-only role): the failing-before/passing-after cases establish the defect and fix. Cookie priority, fallback and equal-weight behavior are exercised by the focused suite. Page and realtime consumers were inspected, not claimed as new browser acceptance evidence.

The central matrix remains reserved to A. Handoff: retain the existing I18N-02 feature status and add this regression evidence; #73 remains open for its broader screen/state sweep. No merge or remote-resource operation.
