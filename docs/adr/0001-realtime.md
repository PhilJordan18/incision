# ADR-0001 — Socket.IO and Next.js on a persistent server

- Status: **selected for the prototype, not yet demonstrated**.
- Created: September 29, 2026; revised: October 2, 2026 after the final brief.
- Requirements: TECH-05/06/07/09, SALLE-06/09, CONF-12, COURSE-03/05/06/08, PERF-02/03.

## Context

Next.js App Router, React, TypeScript and PostgreSQL/Drizzle; deployment on a server/VPS explicitly required. Update of October 3: despite the possibility written in the brief, Philippe confirms that no cégep server is available; zero personal budget. A room accepts 2 to **30 participants**, bots included, spectators excluded. The countdown lasts **3 seconds** and the resumption window **30 seconds**. These values replace those of the previous version.

The checkpoint requires room members synchronised across browsers, not yet the whole race. The architecture must nevertheless allow an authoritative clock, bots, bonuses and durable results.

## Decision

**One Node process** runs Next.js and Socket.IO on the same HTTP server, behind the HTTPS reverse proxy. One instance initially; presence/race state in memory. PostgreSQL stores identities, rooms, configuration, invitations and results. No paid realtime service and no separate service at the checkpoint.

Pure rules live in the business modules; Socket.IO is an adapter. The custom server uses TypeScript run with `tsx`, planned as a production dependency. Next compiles its pages, not this server. TS packages are consumed through `transpilePackages` in Next and through `tsx` on the server side; this complete path must be tested before the features.

**Do not use `output: standalone` with this custom server.** The current `next dev` / `next start` scripts do not start any Socket.IO: a successful Next build does not prove that the setup is feasible.

## Alternatives

| Option | Strength | Reason it was not initially selected |
|---|---|---|
| HTTP polling | Simple | More requests and delayed presence/progress. |
| Native WebSocket | Lightweight, standard | Acknowledgements, rooms, reconnection and protocol to build in a short time. |
| Socket.IO + Next in the same process | Same origin, rooms and reconnection available, one delivery | Selected; requires a persistent server and a start-up prototype. |
| Next and a separate Socket.IO service | Independent deployment/load | Two services, shared authentication and extra operations with no measured need. |

TECH-05 requires a server. The priority option becomes a VM under Azure for Students credit, subject to eligibility, credit and available capacity. No move to a paid offer is allowed. If this option fails, Render Free + Neon Free is a technical fallback, not an administered VPS: get the teacher's agreement on TECH-05 before declaring it compliant. The architecture stays portable between these environments; durable local storage is only possible on the VM, not on Render Free. See [limits and checks](../architecture/verification.md#hosting-without-spending).

## Contracts, authorisation and ordering

- Handshake: verify the account session or the signed guest cookie, and the origin; refuse an expired identity. The identity is application-level, never `socket.id`.
- Each command is validated by a Zod schema, with an operation identifier, room/race and sequence as applicable. Authorisation on **every action**, not only at connection. No client decides its role or its Socket.IO group.
- Durable mutations: PostgreSQL lock/transaction, then acknowledgement and broadcast **after commit**. Repeated operations remain idempotent.
- Snapshot on entry/resumption, then events with a monotonic revision. Missing revision: resynchronisation, no trust in the client's ordering.
- Native Socket.IO reconnection is useful but not guaranteed: application-level resumption re-authenticates, checks ban/phase/delay and restores the existing spot.
- Several tabs: a single logical presence, a single active input authority; losing the last connection triggers the grace period.
- Codes/invitations: limits per IP/identity, bounded size and frequency. The proxy must supply the IP according to a configured chain of trust.

## Race frequency and authority

Server clock for start, timer, grace period, bonuses and arrival. Sequenced input batches initially limited to 10 messages/s/player; the server validates the content and rejects impossible jumps/speeds. This check is not a guarantee against all automation.

Compact room projection broadcast initially at 4 Hz, with UI-side interpolation. No packet of every keystroke to every player. Bots are computed on the server side and follow the same rules. Spectator limits separate from participant capacity if operations require it; document any added limit.

MPM series are sampled in memory (target 1 Hz + end), then persisted with the results, aggregated errors and bonus events. No SQL per keystroke. A process crash may lose an active round: on restart, report it as interrupted, without creating fake results. The 30-second resumption concerns the browser connection, not a server high-availability guarantee.

## Mandatory prototype and evidence

1. Clean Node 24 install; dev start, reload, and build then production start of the custom server. Check the imports of the shared packages.
2. Public HTTPS and Socket.IO through the proxy; connection keep-alive and resynchronisation after a disconnection.
3. GitHub account, then Discord account; local sign-in for Playwright. The same session validator protects HTTP and Socket.IO.
4. Two independent browsers create/join a room by code and observe members/permissions without reloading.
5. Tests: invalid code, guest creator refused, double tab, two concurrent admissions, re-sending of a command, expired session.
6. CI on every push; deployment of main after success; health endpoint, migrations and production smoke test.

After the checkpoint: race with 30 participants, bots and simulated humans, then a human check of smoothness; tests at 29 999/30 000/30 001 ms; consistent results despite replayed packets. Additional internal targets to measure: visible latency p95 <500 ms and results available in <2 s. These are engineering goals, not additional thresholds attributed to the teacher.

## Limits and evolution

A restart cuts the sockets; durable rooms reload, but a race is not restored keystroke for keystroke. Plan announcements, controlled shutdown and deployments outside demonstrations. Scaling to several instances would require coordination of the race engine, sharing of presences/events and durable resumption; simply adding a rooms adapter does not make the business state distributed.

## Technical sources

- [Next.js: custom server](https://nextjs.org/docs/app/guides/custom-server)
- [Socket.IO: rooms](https://socket.io/docs/v4/rooms/), [recovery](https://socket.io/docs/v4/connection-state-recovery/), [delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/)

## History

The October 2 revision replaces 50 humans / 5 min resumption / 5 s countdown, removes the assumption of a room hosted by the system and aligns invitations with IP + session binding. The modular monolith decision is kept.
