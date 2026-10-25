# F-07.5B — Private account photo (#68)

Local implementation on `feat/f-07-5b-profile-photo`, from `dev` `3a1dcff`. Philippe confirmed A's reservation handoff: migration 0005, photo database exports, web manifest and lockfile. No corpus file, remote database, deployment or merge is changed.

## Scope and boundaries

- AUTH-04 / SEC-02: authenticated upload on `/account`, available without JavaScript. JPEG, PNG and WebP are identified by bytes and decoded, not trusted MIME or filename.
- Original size: 1–2,097,152 bytes; at most 16 million pixels and 8,192 pixels per edge. Animated WebP and PNG animation control chunks are refused. The decoder has a three-second processing timeout; one encoding/save operation may run per process, with a translated busy refusal instead of an unbounded queue.
- Auto-orientation, central square crop and WebP re-encoding at 256×256; output at most 256 KiB. Original bytes and metadata are not persisted. No remote image fetch or external storage service.
- Session identity is resolved again inside the action. Duplicate/missing/oversized files and invalid image data cannot replace the saved photo. An atomic upsert replaces only that account's row; its revision changes so the page reloads the new image.
- `GET /api/account/photo` returns only the current authenticated account's image. Query parameters cannot select another account. Responses are private/no-store, nosniff and same-origin; anonymous access is 401, missing photo 404, storage failure 503.
- The account page loads the revision only, not the image bytes. Its photo stays private: room, race and result avatars are outside this slice. No delete-photo control or full screen-12 redesign is claimed.
- `sharp` 0.35.5 is now an exact direct production dependency, already present at that version through Next. Next's action-body ceiling becomes 3 MiB to accommodate a 2 MiB file plus multipart framing. The action still enforces 2 MiB before decoding; a request exceeding the framework ceiling is rejected by Next, not the translated form validator.

## Database and deployment handoff

`0005_profile_photos.sql` is additive. `profile_photos` has an account primary/foreign key with deletion cascade, WebP bytes, revision and timestamp. Storage constraints bound bytes and require RIFF/WEBP headers; they are not substitutes for the application decoder. No existing identity, room or corpus table is altered.

Apply the migration before the application release. Rolling back the application does not require dropping the new table; retain it to preserve photos. PostgreSQL backups include the photos. No migration was applied to Neon.

The photo export follows `./identity/accounts`; preserve A's separate `./corpus/defaults` and `./corpus/load` exports when integrating. A's next migration must use the then-current free number, not reuse 0005. Native Sharp packaging has been exercised on macOS; Linux CI remains necessary after delivery.

## Verification ledger

Runtime: `7db924e` (database slice `93a01b0`). Test-only changes `f030e13` and `7c2968a` wait for authentication navigation and completed logout; no application assertion was removed.

| Verification | Result |
| --- | --- |
| `check:no-js`, lint, typecheck on `7db924e` | Passed |
| Workspace unit tests | 583 web + 130 database + 1,040 domain + 20 load + 47 word-list tests passed (1,820) |
| PostgreSQL suite | 187 passed; 9 PgBouncer cases skipped without configuration |
| Drizzle generate | No migration drift |
| Production build | Passed, Next 16.4.3 |
| Production dependency audit | Zero reported vulnerabilities; no audit-fix operation |
| Production archive | Built with production-only dependencies; Sharp decodes/re-encodes through the actual server |

Browser evidence covers photo save/replacement/reload, metadata removal, keyboard submission, refusals preserving old data, account isolation, logout, a 2 MiB upload without JavaScript, and display-name regression. Final archive run on `7c2968a`: **6/6 passed**, Chromium, 52.4 seconds. Runtime is unchanged from `7db924e`.

Representative error-state screenshots: [1440px EN Aube](photo-en-aube-1440.png), [1024px FR Abysse](photo-fr-abysse-1024.png), [390px FR Abysse](photo-fr-abysse-390.png). The native file-picker wording follows the browser/OS language; application labels and feedback are translated.

The first browser run passed 5/6: a new account's API request raced its pending sign-in and correctly received 401. The next archive run passed 5/6: the logout assertion raced the pending sign-out and received 200 while the session was still valid. Both traces were retained, and the tests now wait for observable navigation before checking access. These were test synchronization defects, not evidence of an authentication bypass.

Logs and traces remain in `.codex-worktrees/_tools/`: `f075b-gate.log`, `f075b-release.log`, `f075b-release-final.log` and `failures/photo68b-*`. Port 3989 and the dedicated local `incision_e2e_photo68b` database isolate browser verification. Heavy work holds the shared lock; other projects' containers are untouched.

## Sequential reviews

Code, security, DBA, functional QA, UI/UX and deployment roles were applied sequentially by one Codex session, not independent reviewers. Runtime review concerns `7db924e`; later changes are test synchronization only.

- Code/security: authenticated action and route, untrusted previous state ignored, no selectable account ID, actual decoding, metadata removal, bounded bytes/pixels/output, no original persistence, no remote URLs. Next's existing origin protection remains enabled. A malformed APNG chunk has refusal coverage; that test alone does not prove a valid animated PNG fixture against every decoder.
- DBA: additive schema, isolated atomic upsert, revision replacement, account deletion cascade, concurrent saves and prior-photo preservation verified. Header checks are storage defense only.
- Functional: named formats, boundary/refusal cases, busy/error cleanup, private retrieval and unchanged account identity are covered. No live OAuth-provider round trip is claimed.
- UI/UX: existing screen-12 tokens and 180px circular portrait, FR/EN labels, non-colour-only errors, visible keyboard navigation, one red primary action. Axe and overflow checks cover both themes/locales; reference widths are 1440, 1024 and 390px. This is a scoped profile addition, not completion of the full design.
- Deployment: archive carries direct Sharp production dependencies; migration precedes runtime. Linux native dependency validation and production acceptance remain outstanding.

No full-site E2E, Safari/Firefox, live OAuth, remote migration or production test is claimed. The nine skipped PgBouncer cases are not counted as successes. #68 stays open.

## Human acceptance

1. Upload a JPEG/PNG/WebP on `/account`; reload and confirm the square photo persists.
2. Submit a non-image or a file over 2 MiB: read the error and confirm the previous photo remains.
3. Replace the image, switch language/theme and inspect the narrow layout.
4. Sign out: the private image endpoint must refuse access. Another account must not see this account's photo.
