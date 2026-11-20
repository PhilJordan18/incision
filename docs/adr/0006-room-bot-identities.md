# ADR 0006 — Room bots are not accounts or members

Status: accepted for F-05.2 slices A/B (approved plan, 28 October 2026).

## Context

CONF-10 permits the host to add/remove bots and select one of the five BOT-01 levels.
Bots share participant capacity and the start minimum, but must never host or gain a
human's session, private history or result access. Existing memberships require an
account and form the target of the room's host foreign key.

## Decision

Persist waiting-room bots in `lobby_bots`, with a UUID, room foreign key, stable domain
level and creation time. No account, membership, session or socket is manufactured.
Deleting the room cascades its bot roster. Removing a bot deletes only its roster row;
the race integration must freeze entrant identity and level independently of that row.

Host mutations take the same room lock as human admission and race start. Host identity
is rechecked under that lock. Changes are allowed in `waiting` only, following the
existing settings lifecycle. The submitted room revision prevents an old tab or a retry
after a lost reply from silently adding a second bot. A mutation bumps the revision and
publishes a fresh room snapshot after commit; clients do not invent optimistic bot rows.

Human participant admission counts the bot roster under the same lock. Spectator quotas
remain independent. Host succession still selects only actual account memberships.
The room snapshot reads its bot aggregate in the same SQL statement as the revision and
members. Public bot data contains only bot ID and level, never a random seed or plan.

## Delivery boundaries

Slice A supplies the roster, host controls, admission and persistence. It does not run
bots or change the race minimum. Slice B must include bots in the frozen race roster,
drive the existing pure engine through the authoritative reducer and identify them in
the track and persisted results. A populated room roster alone proves none of those.
Arcade qualification and activation remain separate acceptance work.

Slice B freezes `kind` and `bot_level` on each race entrant, using a new entrant UUID
per round. Bot entrants have neither account nor member IDs; a database constraint
enforces that distinction. Removing a waiting-room bot cannot erase earlier results.
One server timer drives the existing pure bot engine and feeds its batches into the
same authoritative reducer as human keystrokes. Deadlines reduce before delayed bot
actions, with no retroactive catch-up. Ownership suspension stops bot scheduling;
ownership loss, room closure and server shutdown stop it permanently for that runtime.
Results retain real counters, WPM series and private error aggregates. Private reads
still require an authenticated human entrant; profile victories require another human.

## Migration and recovery

Migration `0009_room_bots` is additive and creates an initially empty table plus an index.
It does not rewrite accounts, rooms or past races. Deploy the schema before the new app.
During a mixed-version rollout, an older app does not count bots: do not allow roster
mutation until every serving app uses the new admission code. Returning to an older app
with populated bot rosters likewise requires suspending bot management first. Do not
drop populated tables as a routine rollback; forward-fix with a new migration instead.
No Neon or production action is part of the local evidence for this decision.

Migration `0011_race_bot_identities` follows shared `0010_race_key_errors`. Existing
entrants default to `human` and retain their account foreign keys. The new CHECK allows
null accounts only for bots with a valid frozen level and no membership. Once bot races
exist, an older application expecting every entrant to have an account is not a safe
rollback target. Preserve persisted results and forward-fix instead of deleting them.
