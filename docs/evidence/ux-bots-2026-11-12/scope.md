# F-05.2 / #59 — bot roster clarity

Source: Philippe's November 12 mandate and visual supplement; implementation and delivery authorised.
Base: dev e663a2ea93d918163d88e0d82f4f94bdc6441863, merged #198/#199/#200; no open PR at scoping.

Acceptance: separate add and roster components; independent new-bot level; explicit saved and unsaved levels; accessible visible success for add/save; five distinct original maritime SVG insignia beside existing textual names/difficulties. Preserve all bot rules, levels, capacity, host permissions and server revision checks.

Scope: room-bots-panel, new room-only child components, dedicated room-bots dictionary, focused E2E and evidence. No race component, global stylesheet, engine, server or design-source edit. Screen 06's tokens/controls retained; the approved mandate replaces the former undifferentiated roster layout.

Verification: root checks/build, targeted and complete E2E, FR/EN, both themes, 390/1024/1440 (plus existing 360), keyboard, axe, independent selectors and persisted roster. Sequential code/QA/UI reviews on the exact source SHA. One independent PR from dev; no dependent branch.

The optional compass cursor is deferred as a proposal: a global cursor change would share styles with Claude. Future full redesign, sounds, track/animations and continuous heatmaps stay separate.
