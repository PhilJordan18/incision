# F-10 / #88 — UX qualification and evidence reconciliation

November 12 mandate: diagnose unexpected room closure after reading results; correct only a reproduced violation of SALLE-08/D-03/D-06. Reconcile November 5 and November 11 human statements without inventing captures or database inspection. Independent dev base e663a2ea93d918163d88e0d82f4f94bdc6441863; no prerequisite PR.

Read-only diagnosis so far: room-channel follows room-page sockets; the private /races/[id] history view does not watch room presence. Leaving the last room tab starts the existing 30-second host grace. At expiry the oldest connected human inherits; with no successor the room closes. Results already finalized remain stored. This is a hypothesis to reproduce, not a claim about the exact network cause of Philippe's historical room closure.

Tests: real server/bot race with synthetic fixture text, then navigation to the finished race; verify closure without successor and succession with a connected human, retained results, and no immediate voluntary-leave mutation. Existing voluntary leave, reconnection/multi-tab and SQL tests remain separate evidence. No runtime/TTL change unless these tests show a product violation.

Matrix ownership is confined to this branch to avoid conflicts between the independent UX PRs. Historical proof files remain unchanged. New human testimony is labelled as testimony, not agent execution or capture. Guest anonymity on screen is not evidence of purge in the database. New UX delta remains to accept.
