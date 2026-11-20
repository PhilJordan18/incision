# F-07.4 / #67 — finding the next and previous race

Philippe's November 12 mandate authorises implementation/delivery of navigation (B) and concise home orientation (D), treated as one entry-point UX goal. Independent branch from dev e663a2ea93d918163d88e0d82f4f94bdc6441863; no dependency on the bots branch.

Acceptance: account exposes My rooms and My races first and shows the existing active membership (at most one) separately from private completed history; no admission or retention rule changes. Home explains rooms, training/Arcade, typing/bonuses and results while keeping its actions first. Original static maritime SVG and existing tokens only. No logo/design-source modifications.

Files: account/page and new account journey component; home/page and new guide; dedicated i18n file; tests/evidence. No header, global CSS, race component, server mutation or main dictionary rewrite. The shared header is deliberately left unchanged; the existing Account link exposes the new journey section. No open PR/new Claude branch was visible at scoping; the user was asked for any unpublished shared paths. Race/typing/activity paths remain reserved.

Reviews: code, QA, UI, security (private membership read) and DBA (existing query reuse). Tests: root checks/build, focused/private navigation and complete E2E, FR/EN/themes/keyboard/390/1024/1440, axe and home Lighthouse. No new database schema or dependencies.

The added educational guide intentionally extends the home page below the fold. The former entire-page-no-scroll assertion is replaced by above-the-fold entry controls at the same desktop viewport; horizontal-overflow and accessibility thresholds remain unchanged.

Qualification addendum: the full suite reproduced the existing invitation-refusal focus defect also found in the bot branch. Reuse the exact two-file callback-ref fix and four deterministic mouse/keyboard tests; no invitation rule change or branch dependency. Report the shared identical patch explicitly. Claude's now-published #203 has no intersecting changed path.
