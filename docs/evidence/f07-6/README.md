# F-07.6 — shared locale formatting, work in progress

Branch: `feat/f-07-6-locale-format`, from `dev` `2b99993`.

Implemented: pure Intl formatters usable in server and browser modules. Dates require an explicit time zone (language alone cannot choose one); number options preserve the caller's rounding. Race WPM, accuracy, progress and ordinal numbers reuse the shared number formatter. No new date surface is invented for unimplemented history/profile pages.

Executed locally:

- `npm test -w @incision/web -- src/i18n/value-format.test.ts src/i18n/format.test.ts src/races/format.test.ts`: 7 passed.
- `npm exec -w @incision/web -- eslint src/i18n/value-format.ts src/i18n/value-format.test.ts src/races/format.ts`: passed.
- `npm run typecheck -w @incision/web`: passed.

Remaining before delivery: localized counts/round numbers in existing components and race metadata; explicit coordination for room/race view files touched by #133; final repository checks and targeted rendering evidence. No browser, full build or production pass is claimed for this new card. No PR yet; card remains In progress.
