# F-01.4 — invitation access evidence

Implementation/test SHA: `1f2b6eec001acceac8c5b11eb442cf181c372c70`.
Runtime code last changed at `1261872b34bb5b8cba61288b782e162ff77ba72d`.
Base: `dev` at `1a0ed972c3456c5141872d5611b5af8cda0ae738`.
Branch: `feat/01-4-invitation-links`. Refs #34; human acceptance remains pending.

## Delivered scope

- Host-only generation, status pages and revocation; account and verified guest hosts.
- Cryptographically random 256-bit tokens, digest-only storage, one-time display.
- Fragment links keep bearer tokens out of request URLs and OAuth callback parameters.
- Atomic first-use binding to verified identity and canonical full IP; same-NAT identities remain distinct.
- Account/guest admission, capacity and phase checks; private rooms never admit by code alone.
- Direct HTTP room resumption and Socket.IO watches enforce the same IP binding before exposing a snapshot/presence.
- No arbitrary time expiry. Closure/revocation refuse link reuse; revocation alone is not expulsion.
- Additive generated migration `0015_room_invitations`; no published migration modified.

## Reproducible checks

Node 24.13.0, local PostgreSQL 17, isolated port 55439. Heavy commands use
`.claude/worktrees/_tools/heavy.sh`. No recipe database, backup or port3880 was used.

| Check | Observed result |
| --- | --- |
| `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build` | All pass, reproduced at final implementation/test SHA; 2,409 unit tests (web969/database146/domain1212/load20/word-lists62). |
| `npm run test:db -w @incision/database` | Runtime SHA: 370 pass, 9 PgBouncer skips (no pooler configured). |
| `npm run test:db -w @incision/database -- test/room-invitations.db.test.ts` | Final test source: 15 pass, including two additional guest-host/closure tests after the full SQL run. Do not report 372 as a full-suite run. |
| `npm exec -w @incision/web -- playwright test e2e/room-invitations.spec.ts` | 3 Chromium scenarios pass in 28.2s on final test SHA; server port3894, disposable `incision_e2e_l2_invitations`. |
| `git diff --check` | Pass. |

Browser coverage: FR/EN, account/private-room admission, guest admission, distinct identities
on the same IP, direct-room refusal on changed IP and successful return on original IP,
host-only controls, status/revocation, token absent from HTTP request URLs, token lost on
host reload, keyboard generation/admission, axe WCAG A/AA, horizontal overflow checks,
Abysse/Aube at1440/1024/390/360px. Theme tests use the actual preference button, not a
direct DOM mutation. Screenshots are captured after reload, without bearer tokens.

Screenshots: [Abysse1440](abysse-1440.png), [Aube1024](aube-1024.png),
[Aube390](aube-390.png). Full FR/EN theme/viewport captures are reproducible from the E2E spec.

## Sequential reviews at implementation/test SHA

Codex applied repository roles sequentially; these are not independent-agent reviews.

- Code: separate domain rule, validated adapters, shared locked admission helpers; no text-provider/configuration changes.
- Security: server identities/host rechecks, trusted-proxy address derivation, room-scoped HMAC, canonical tokens, generic refusals, secret-free projections/logs. Found and fixed the direct HTTP/WebSocket IP-resume bypass before delivery.
- DBA: room-first lock ordering, unique token digest, complete binding check, compound holder-room foreign key, lookup indexes, atomic admission/binding, additive rollback. Empty-database replay and concurrent first use/closure tested locally.
- Functional QA: named browser/SQL refusals above, guest-host succession, invalid guest proof, post-departure binding transfer and revocation without expulsion.
- UI/UX: screen06 composition retained with separate host card; existing design tokens, no new red primary action, FR/EN and both themes, responsive screenshots and keyboard checks. Screens03/06 are references, not fabricated design evidence.
- Deployment: dedicated optional server key documented in `.env.example` and architecture note; absent key fails closed. No key provisioned remotely. Rotation blocks old bindings and requires an active-room recovery plan.

No known blocking finding remains in this slice. Not checked: all-browser-suite rerun,
Safari/Firefox, production reverse proxy/OAuth, PgBouncer, human acceptance.

## Boundaries / human checklist

- L1 PRIVATE creation/visibility controls remain separate; browser tests set PRIVATE only in the disposable fixture. Public discovery (#46) is not implemented here.
- L3 expulsion/bans and revocation on expulsion remain separate. Do not close SALLE-04/#34 or the parent room card before the combined human acceptance.
- Status refresh is explicit; original links cannot be reconstructed. After sign-in, reopen the original invitation link.
- Human: generate/copy a link; join with another account and guest; try sharing the used link; reload from the same identity/IP; revoke and retry; check both themes and keyboard; later verify PRIVATE creation and expulsion once L1/L3 are integrated.
- Recipe preservation: existing recipe data and server are unchanged. This report does not claim integration into recipe3880 or activation in production.
