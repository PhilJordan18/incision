# PR #200 — reduced-motion theme contrast

Correction source: `175711d9942ea31593e9cf9e8328ae8f6e04d039`, on the existing
`test/10-integrated-qualification` branch. Base remains
`39fe1249a1ce5b7337976acf4c36614557b305a1`. This report adds to, rather than
replaces, the [integrated qualification](../integrated-2026-11-08/README.md).

## Earlier CI results — both events matter

At `e21cf4462e23a98c3039435ec81427ed2654c727`:

- [pull_request 42624865595](https://github.com/PhilJordan18/incision/actions/runs/42624865595): success, 214 E2E passed.
- [push 42624858822](https://github.com/PhilJordan18/incision/actions/runs/42624858822): failure, 211 E2E passed and three contrast failures: guest Quickplay FR/EN and invitation lifecycle EN.

The previous declaration that the PR was green was incomplete. The specialized
commit-workflow connector filters to `pull_request`. Verification now uses
`GET /repos/PhilJordan18/incision/actions/runs?head_sha=<SHA>` and checks **both**
events and their exact head SHA. A pending or failed run is not green.

The full failed-job log (job 129185896815) was read. Its contrast targets include
the inactive language button, guest nickname hint, secondary page text, invitation
timestamps, room hints and labels. The archived traces could **not** be read in
this executor: artifact 13678773294 is 60,972,430 bytes, above the transfer tool's
32 MiB limit; direct GitHub API and supplied download-URL requests returned 403.
Artifact digest: `8c8ab7e6bc19a3859d60414dfd8d8b52e7adb40dfd1a420410beb4c641af4731`.
No original CI trace inspection is claimed. Local failing regression traces were
created and read; they retain the sampled contrast failures described below.

## Cause and minimal correction

All three failing scenarios enable `prefers-reduced-motion: reduce`. The imported
design stylesheet sets `transition-duration: 150ms !important` on every element.
For plain text and backgrounds, the default `transition-property: all` then
creates transitions that did not exist in normal motion. During the theme change,
foreground and background interpolate through nearly equal luminances.

This is a real transient product contrast defect, not merely an axe timing error.
Waiting for animations to finish would conceal it. The original four localized
scenarios passed in one local baseline run, but per-frame measurements and the
new regression still demonstrated the defect before correction.

The application stylesheet now permits only opacity transitions in reduced
motion. The design's 150 ms fade and frozen animations remain; theme colours
switch immediately. Explicit `transition-none` controls and the race track's
existing opt-out stay disabled. Design source files and colour tokens are
unchanged. Normal-motion styling, product rules, databases, dependencies and
CI configuration are unchanged. Axe rules, thresholds and tested elements are
unchanged; no conditional retries or hidden elements were introduced.

The new FR/EN E2E regression samples the nickname hint and its nearest opaque
background on animation frames through both theme directions, driven by both
system preference and the theme button at 1440, 1024, 390 and 360 px. It waits
for the requested theme to appear **while sampling**, then continues sampling
for 350 ms; every reading must meet 4.5:1. It does not wait out the transition
before measuring contrast.

## Measurements and local commands

Cloud only, synthetic isolated databases, local PostgreSQL port 55433. Existing
data, volumes and backups were preserved. Test fixtures use fresh signing keys;
no real OAuth, Mac, recipe, Azure or Neon access.

| Measurement | Before | After |
|---|---:|---:|
| Stable hint, Abysse | 6.5165:1 | 6.5165:1 |
| Stable hint, Aube | 6.9972:1 | 6.9972:1 |
| Sampled transition to Aube | minimum 1.5411:1 | minimum 6.5165:1 |
| Sampled transition to Abysse | minimum 1.0928:1 | minimum 6.5165:1 |

These are sampled measurements, not a proof of every possible browser frame.
[measurements.json](measurements.json) records computed colours, timing, sample
counts and nearest-background ratios. Axe also ran during the probe; it missed
the short defect in those probe runs, illustrating why a passing single audit
did not establish safe transitional contrast.

Commands run from the repository root, using
`E2E_DATABASE_URL=postgresql://incision_test:incision_test_only@localhost:55433/<isolated-db>`
and `E2E_PORT=3601` (baseline 3600):

- Original Quickplay/invitation localized selection: **4 passed**, 54.1 s,
  database `incision_e2e_contrast_20261110`.
- New `e2e/theme-contrast.spec.ts` against the old build: **2 failed as expected**,
  FR minimum 1.5411:1 and EN 1.5563:1. [Failure log](red-regression.log).
- `npm run check:no-js`, `npm run lint`, `npm run typecheck`: passed.
- `npm test`: **2654 passed** (1106 web, 157 database unit, 1259 domain,
  21 load tools, 111 word-list tools).
- `npm run build`: passed.
- Keyboard probe on the rebuilt guest page: theme control reached in five Tabs,
  solid 3 px focus outline, Enter switches to Aube and back to Abysse.
- `npm run test:e2e -w @incision/web -- e2e/quickplay.spec.ts e2e/room-invitations.spec.ts e2e/theme-contrast.spec.ts --grep 'a guest quickplays|invitation lifecycle|reduced-motion theme'`:
  **6 passed**, 1.1 min, no retries/skips within the selection; other scenarios
  intentionally excluded by the selection. [Targeted log](green-target.log).
- `npm run test:e2e -w @incision/web -- --output=/workspace/scratch/contrast-20261110/full`:
  **216 passed**, 21.1 min, exit 0, no retries, failures or skips. Fresh database
  `incision_e2e_contrast_full_20261110`. [Full log](full-e2e.log).

## Review and remaining boundaries

Code-reviewer, functional-QA and UI/UX roles applied sequentially by one agent
on `175711d`; no independent review claimed. The CSS override retains the fade,
preserves explicit opt-outs and introduces no colour literal. The regression
failed before the correction and tests the visible contrast during switching.
The complete suite also passes the existing race-track and live-label
no-transition assertions.

Guest Aube FR and room Abysse EN captures were visually inspected at 1440, 1024
and 390 px against design screens 03 and 06 and their HTML references. The
existing product adaptations and layout are unchanged. Representative synthetic
captures: [guest 390](guest-fr-aube-390.png),
[invitations 1440](invitations-en-abysse-1440.png). Invitation captures contain
no bearer link. Both localized scenarios audit both themes at all four widths
with the existing full axe checks and horizontal-overflow assertions.

PgBouncer remains unconfigured: nine SQL pooler tests were skipped in the prior
runs and must be reported separately from E2E. Final push and pull_request CI
results belong to the exact new PR head and are reported in #200 and the delivery
message; they must both finish successfully before declaring the PR green.

Human acceptance remains unconfirmed, including the bonus-journal delta and
Philippe's personal reflection. No requirement status or card closure is promoted.
No merge, deployment or production activation is performed.

## Integrity and verified snapshot

All local code checks above ran on `175711d9942ea31593e9cf9e8328ae8f6e04d039`.
The following evidence commit changes documentation only. Its exact SHA is
reported in #200 with both CI outcomes. [SHA-256 manifest](sha256.txt) covers
this report and its attached evidence. Historical screenshots regenerated by
the tests were preserved in cloud scratch and restored in the repository.
