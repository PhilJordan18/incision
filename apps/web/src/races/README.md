# Browser race and bonus integration

`RoomView` owns one `RaceClient` and `BonusClient` per page. `BonusChannel` ties the socket
lifetime to the race's identity, authoritative phase/control, and shared server-clock offset.
A reconnect waits for a fresh private inventory; taking control explicitly re-watches the room
because the existing control command sends `race:self`, not `race:bonus:self`. Cleanup removes
the subscription and both request/fog timers. No global keyboard handler is installed.

Enter activates the FIFO grant only in the focused typing field, while controlling a racing
entrant. Repeats, composition (including keyCode 229), modifiers and open warning questions
are ignored. It is never a keystroke or inactivity refresh. A timeout is **unconfirmed**, not
a claimed refusal: another intentional Enter retries the same pending command. Only the
authoritative acknowledgement/private snapshot changes inventory. The server re-authorizes
all actions independently of these UI guards.

The displayed text, marks, cursor and local progress denominator share `typing.target`.
Reliable target updates preserve pending prediction; older acknowledgement sequences/text
versions cannot restore the previous target. An in-flight old-version batch still follows the
server's existing resynchronisation contract; the UI does not invent edits or replay refusals.

Fog hides future tokens visually and from the accessibility tree until the server expiry.
The typed prefix, current token and separator remain readable. Invisible spans retain their
layout, with no animation. Fog is a gameplay display effect, **not protection against inspecting
the DOM or messages**. Announcements identify the actor, effect and target on the track, are
deduplicated by the controller, and never move focus. They are not replayed after reloading.

## Deliberately disabled integration (#62B2)

Normal rooms still freeze `bonuses: false`. This slice provides no host setting, enabled seed,
production extension provider, corpus import or bot activation. These are separately scoped
dependencies; #62 and CONF-09 remain open. Enabled-bonus load with distinct mutable texts
also remains unqualified. Do not infer production readiness from the browser fixture.

`e2e/bonus-ui.spec.ts` renders the real production pages in two browser contexts. Its isolated
Socket.IO polling server runs the real `RaceRuntime` and coordinator, but admission, lease,
persistence and extension words are explicit test doubles. It proves the rendered effects,
FIFO, input guards, control/reload, target announcements, responsive layout and accessibility,
and inspects finalized results handed to the store double. The ordinary `race.spec.ts` proves
disabled mode and PostgreSQL-backed results; the B1 channel test covers real WebSocket
transport and server authorization. None alone is proof of enabled Arcade in normal rooms.

Design adaptations: D-16 replaces screen 09's obsolete host buttons with the entrant's Enter
hint; D-11 fixes fog at three seconds. Feedback uses the existing Arcade token beside the
typing column, not a moving banner. The existing simple track and phone/tablet limitations
remain for their own cards. No direction-art assets, logo or tokens are changed.
