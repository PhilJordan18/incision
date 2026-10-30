# F-01.5 — moderation integration boundary

Approved L3 scope: SALLE-07 / SEC-01, issue35. This is a work-in-progress record,
not a delivery or acceptance report.

## Implemented independently

`e56f472`: pure `decideExpulsion` rule. Server-read current host authority, active
target, no self-expulsion, account/guest identity retained without an IP ban.
Participants and spectators are eligible in each open room phase. No change to
race ranking or terminal semantics. Domain lint/typecheck and24 focused tests pass.

Branch `feat/01-5-kick-and-ban` starts at dev `1a0ed97`; it is not stacked and is
not pushed. No runtime admission rule or UI is activated by this domain-only step.

## Remaining integration

1. Add identity-scoped room bans, with account/guest distinction and uniqueness.
   Generate migration0018 against the real preceding0015/0016/0017 snapshots;
   never rename or rewrite published migration history.
2. Under the room lock: re-read host, validate target from that room, persist ban,
   revoke target invitations and end presence atomically. Preserve guest command
   fencing and existing retention policy; refused/repeated commands are harmless.
3. Reject banned identities in code and invitation admission, including concurrent
   reentry. Do not ban the shared classroom address or unrelated identities.
4. Reuse committed departure events for race termination; evict every target tab
   from room/race following. Do not write into Claude's race-service code without
   coordination. Preserve countdown/racing/results rules and historical results.
5. Separate host-only FR/EN moderation control with confirmation, visible focus,
   existing design tokens and no text-settings form changes.
6. Real SQL tests: invalid/non-host/self/other-room target, account/guest, duplicate
   commands, concurrent admission/expulsion, invitation revocation, shared NAT,
   closure and retention. Browser: multiple tabs, target and non-target sessions,
   countdown/racing/results, reload/reconnect, keyboard, axe and both themes.

## Coordination gate

L2 migration0015 is accessible in PR190 on `feat/01-4-invitation-links` at
`115817d1a74eba0a1ca72e30ec9a32634e9742bf`. Claude owns subsequent C2/C3 migrations
0016/0017. Their regenerated chain is not available in this worktree yet.
Philippe has been asked whether dependent PRs may be stacked rather than waiting
for human merges. Do not infer that authorization from this file. No recipe3880,
database, backup or server changes are permitted by this integration note.
