# Room invitation access (F-01.4)

## Boundaries

Invitation tokens contain 32 cryptographically random bytes. Only their SHA-256
digest is persisted. The freshly generated link is shown once to the host;
subsequent host-only listings expose status and the holder's room display name,
not tokens, token digests, addresses or address digests. Lists use bounded pages.

The link is `/invite#<token>`. Its fragment is read in the browser and sent only
in the admission POST body. It is not put into request paths, query parameters,
OAuth callbacks or logs. The page sets `no-referrer` and `noindex`. JavaScript is
required for this flow. After account sign-in, reopen the original link: we do
not persist the bearer token in browser storage to carry it through OAuth.

The first successful admission binds both the account/guest identity and a
room-scoped HMAC of the canonical full client IP. IPv4-mapped IPv6 is equivalent
to IPv4; distinct hosts within one IPv6 /64 remain distinct. The custom server's
overwritten internal header is the source, never a form field. A different
identity behind the same NAT cannot reuse the link. Capacity, phase, guest proof,
nickname and one-active-room checks still run before binding. Refusal does not
consume the invitation. Room-first locking serializes admission and revocation.

Direct room-page access and WebSocket watches check the persisted IP binding too,
before returning a room snapshot or attaching realtime presence. This is a room
resume rule, not a replacement for identity-based authorization of all actions.
Re-admission by the original holder moves the binding to their new presence.

There is no arbitrary invitation expiry. Closing the room or revoking the link
invalidates it. Revoking an invitation alone does not expel an admitted member;
expulsion and the associated identity ban belong to F-01.5.

## Configuration and operations

Set a dedicated server-only `INVITATION_IP_SECRET` (at least 32 bytes, at most
1024 bytes). Never reuse the account or guest signing keys. Missing/invalid keys
fail closed: no invitation is issued or admitted. Provisioning any remote secret
is a separate human-authorized operation; this change provisions none.

Keep the key stable across server restarts. Rotating it prevents reuse of
previously bound links and direct room resumption because their IP fingerprints
no longer match. Membership rows remain, but affected members cannot resume them.
Rotate only with an explicit recovery plan for active rooms; a fresh link does
not bypass an existing presence's binding. Unused links bind with the current
key. Do not backfill raw addresses or
persist plaintext tokens to work around rotation.

Migration `0015_room_invitations` is additive. It references the holder's room
membership with a compound foreign key. Deleting that membership deletes its
bound invitation; room deletion removes all its invitations. The prior app can
run with this extra table. Roll back application code first if necessary; do not
drop the table containing valid links as part of a routine rollback. Published
migrations stay immutable. Local reservation: 0015 invitations, 0016 text
configuration, 0017 Arcade, 0018 moderation; regenerate later migrations against
the exact preceding chain before publication.

## Verification status

Implementation is in progress. Domain, credential and SQL admission tests exist;
HTTP actions, host controls and account/guest browser journeys are being verified.
This document is not an acceptance or activation record. Recipe databases, their
backups and port 3880 are outside all test commands.
