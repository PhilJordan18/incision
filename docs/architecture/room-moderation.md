# F-01.5 — identity-scoped room moderation

Approved L3 scope: issue #35, SALLE-07 / SEC-01. Branch
`feat/01-5-kick-and-ban`, integrated with dev `b6aac6a` (including C3/#192).
Human acceptance remains outstanding; implementation is not an acceptance claim.

## Authority and transaction

Actions parse intent only (code, target membership UUID, room revision).
Identity comes from the verified account session or signed guest proof. Under the
room lock, the transaction re-reads host and target, rejects non-host, self,
other-room, departed, closed and stale requests, inserts an identity ban, revokes
target-bound invitations, ends membership and bumps revision atomically.
Participants and spectators are eligible in every open phase; bots keep their
separate removal control.

Code and invitation admission check bans under the same room lock. No IP is
stored in a ban; classmates sharing a network remain eligible. Account and guest
UUID namespaces remain distinct. Concurrent/duplicate commands cannot restore
banned membership or duplicate bans.

## Realtime and interface

After commit, the internal expulsion event synchronously removes all followed
sockets for the exact room/member from presence and race following, sends an
explicit expulsion notice and disconnects them. Pending watches cannot restore
following; eviction does not wait for a SQL broadcast. Existing departure events
then terminate active participation; ranking, Arcade and completed results are
not rewritten.

The host-only FR/EN panel confirms expulsion, focuses Cancel, restores the trigger
after cancellation and refuses disconnected/pending/stale submissions. Existing
tokens and secondary buttons preserve the primary red action. During a race,
moderation remains below typing.

## Retention decision approved October 30, 2026

An expelled guest loses live membership/nickname, but their minimal session is
retained while a ban references it, until normal expiry. Expulsion never renews
the target expiry or retains results for a ban. Closed-room retention removes
bans within 24 hours; session deletion cascades bans. Accepted activity in another
room still follows the existing sliding expiry rule. A fresh browser identity can
bypass an identity-only ban; no device/IP ban is claimed.

## Migration and recovery

Generated additive migration `0018_lobby_bans` follows C3's actual published
`0017` snapshot. No published migration is renamed. Identity foreign keys cascade,
a CHECK requires exactly one identity, unique indexes enforce per-room bans, and
a guest index supports retirement.

Verification uses isolated local databases only. Recipe3880, backups and remote
resources stay untouched. Keep the additive table during an application rollback;
do not drop bans as a shortcut. Pre-L3 code does not enforce bans: rollback
requires an explicit operational decision and restricted admission, not a claim
of continued protection.

## Evidence and acceptance

See [verification report](../evidence/f01-5-room-moderation/README.md).
Countdown authorization has domain/SQL coverage; browser scenarios cover waiting,
racing and results. Human acceptance includes account/guest/spectator, multiple
tabs, cancellation, code/invitation reentry and an unaffected shared-network peer.
Do not close #35 or its parent solely because the PR is merged.
