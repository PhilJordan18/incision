# #68 — controlled oversized-photo refusal

Application and test SHA: `12cb5aa`, based on integrated dev `595a3b4`.
No merge, deployment or modification of the human recipe server/database.

## Problem and correction

The human recipe encountered “Avarie” on an upload whose exact size is unknown.
The server recorded a413 from the3mb Server Action parser, before the action's
business validation could catch it. The former2MiB+1 test did not cross that parser
limit. This correction does not raise or disable the global limit.

The photo form uses POST `/api/account/photo`. That route checks exact configured
Origin and current account session before consuming the body, then reads at most
2MiB +64KiB of multipart data before parsing it. It counts actual streamed bytes,
including absent or misleading Content-Length. Oversized bodies are cancelled and
refused; malformed multipart is also a controlled refusal. The existing Zod file
validation still enforces exactly one non-empty file of at most2MiB, independently
of multipart overhead. The existing image decoder, pixel/dimension limits,
re-encoding and database persistence are reused.

With JavaScript, selecting an oversized file immediately shows the existing FR/EN
inline accessible refusal and submitting it sends no upload. Accepted submissions
use the same bounded route. Without JavaScript, the native multipart form returns
a303 to a fixed account URL with an enum status; the protected server-rendered page
shows the same refusal. Status query parameters are presentation only, never
identity or authorization. The client never imports the native image decoder.
The obsolete photo Server Action was removed, including its now-replaced tests.

## Checks at 12cb5aa

- Root `check:no-js`, lint, typecheck, test and build: passed.
- Root unit tests: **2,081 passed** (web702, database131, domain1181, load20, wordlists47).
- Focused photo unit tests: **29 passed**, including body limits/cancellation without
  Content-Length or with a forged smaller value; malformed/failed streams; exact
  2MiB multipart; Origin/session checked before body reading; forged account ignored;
  no save/revalidation on refusal; controlled storage failure and fixed redirect.
- `playwright test e2e/profile-photo.spec.ts`: **7 passed** (1.1min). Valid exact2MiB;
  2MiB+1 and4MiB refused; FR/EN × JavaScript enabled/disabled; no upload request for
  client-side oversized selection; direct POST bypass refused; previous image bytes
  unchanged; reload persistence, account isolation, metadata removal and normalized
  WebP preserved. The existing accessibility case checks both themes/locales at360px
  and overflow at1440/1024/390;12 screenshots are stored alongside this file.
- `test/profile-photo.db.test.ts`: **3 passed**, isolated random temporary databases.

All browser checks used only port3992 and incision_e2e_photo68refusal on local5433.
The recipe server3880, its base, human names/photos and Docker remained untouched.
No whole-browser-suite local rerun; CI results are tracked on the PR separately.

## Sequential read-only reviews at 12cb5aa

- Code: OK. Whole change reviewed; bounded parsing happens before the existing
  business validation, constants shared without server imports, no new dependency,
  migration, integration or global-config change. No remaining blocking finding.
- Security: OK for this scope. Exact Origin and session checks precede body/decoder;
  no account selector from the request; byte cap enforced on the stream itself;
  existing safe decode/re-encode and private GET retained. No user-selected redirect,
  unescaped status, secret or private storage detail returned. Boundary unit tests
  and browser bypass/isolation checks support this conclusion. No remote attack test.
- Functional QA: OK. Both thresholds and all four locale/JS combinations passed;
  prior photo byte equality verified after every refusal. Native forms stay on the
  account page rather than the error boundary.
- UI/UX: OK for this correction. Existing profile adaptation of screen12, tokens,
  label/help/error placement and secondary action retained; error has icon/text,
  role alert and aria-invalid/describedby. Keyboard submission, axe, light/dark and
  narrow widths passed. No redesign or claim of full screen12 implementation.

No independent peer review is claimed: roles were applied sequentially in this session.

## Limits and handoff

These are local fixture proofs, not production or a rerun of the original human
file. The first file's exact bytes remain unknown. AUTH-04/SEC-02 shared matrix and
IA proposals are handed to Claude A separately; their files were not overwritten.
#68 stays open for its unproven remaining profile/statistics/avatar scope.

Human check after this version is prepared: save a valid photo, select a file over
3MB and confirm the inline refusal without “Avarie”; reload and verify the previous
photo remains. No need to alter the existing human recipe environment for this PR.

## CI runtime follow-up

Both initial CI runs at `a0272e5` failed with an unhandled Undici stream rejection
on Node 24.21.0 despite all 702 web assertions passing. The same failure was
reproduced locally on that runtime. The oversized route test constructed an outgoing
FormData/File encoder and then cancelled it as if it were incoming network data;
that encoder could enqueue after cancellation. The fixture now supplies encoded
incoming bytes. No production code, global error handler, dependency or CI setting
changed. Stream byte limits, reads and cancellation assertions remain in
`photo-body.test.ts`.

After the fixture correction:
- Node 24.21.0: all 702 web unit tests passed with no unhandled rejection.
- Node 24.21.0: all seven photo browser tests passed again (37s), using the existing
  production build on isolated port3992/databaseincision_e2e_photo68refusal. This
  includes actual HTTP oversized uploads, native forms and prior-image preservation.
- Node 24.13.0: all 29 focused photo unit tests passed again.

The application remains at `12cb5aa`; this follow-up changes only a test fixture
and this evidence record. CI on the new commit is reported separately on the PR.
