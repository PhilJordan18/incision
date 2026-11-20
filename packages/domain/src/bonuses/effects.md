# Bonus effect primitives — F-06.1 slice B

`applyBonusEffect` returns a replacement entrant or fog metadata, or a typed refusal. It is
**not an activation endpoint**. It does not consume inventory, authenticate an actor, deduplicate
requests, update a race revision, process deadlines or publish an announcement.

## Approved conventions (20 October 2026)

- Shorten one's own text from the end by up to three unstarted words; no artificial finish.
- Offensive effects select the active entrant strictly ahead with the greatest exact progress.
  Ties use stable ID ordering. The actor and terminal entrants are excluded.
- Extend with exactly three normalized word tokens from the server's approved content provider.
  The initial configured count is not a cap on effective length; the existing hard grapheme
  bound is. No truncation or invented fallback.
- Fog lasts three seconds, half-open at expiry. An active fog is refused, not refreshed.
  Refusals must leave the grant available.

The three tokens passed to extension are syntax-checked, not content-approved by this function.
Language, exclusion lists, options, licensing and provenance remain the content provider's job.
It must check the final boundary between the existing suffix and the extension for forbidden
word pairs too. This slice does not modify or import the real corpus.

## Protection and measures

The coordinator supplies `protectedPosition`, the maximum accepted grapheme position ever reached.
It must observe **intermediate applied insertions inside a batch**, including an insertion erased
by a later backspace in that batch. End-of-batch snapshots alone are insufficient. Reset only for
a new race, never on a suffix edit or reconnection. The primitive additionally preserves the
current expected grapheme, including when mandatory correction is pending.

Words use the existing D-10 `countWords` / `cutToWords` semantics; punctuation-only tokens are
not words. Cuts that leave unbalanced parentheses or double quotes are refused conservatively.
Typed content, counters, errors, acknowledgement sequence and presence are unchanged.
Only a successful text edit increments the entrant's textVersion. At the same instant, WPM and
accuracy stay identical; progress changes because the effective denominator changes.

An old-version batch receives the existing resynchronization reply, without consuming its sequence.
The refreshed batch goes through the existing typing validator; no duplicated typing/ranking rule.

## Required future atomic integration (not implemented here)

1. Authenticate the controlling connection; resolve its entrant and an owned, unused grant.
2. Serialize against typing/activation transitions; run `reduceRace` at the injected time first,
   committing any due end/abandon even if the effect is subsequently refused.
3. Supply this deadline-processed authoritative state with `now === race.clock`; never accept
   timestamps, target text, protection boundaries or fog state from a client.
4. Resolve the selected target's current fog metadata from the server ledger. Omitting existing
   fog can bypass non-stacking; the typed primitive is not an untrusted-input validator.
5. Apply the successful replacement and consume the grant atomically. Update the race revision
   and publish the required projection/announcement through the coordinator, not these functions.
   Refusal consumes nothing. Use the grant identity for idempotency; replaying a primitive alone
   can apply the effect twice.
6. Re-evaluate milestone awards on the new effective progress, preserving previously consumed
   milestones. Expire inventory/fog at race end; never change an existing terminal result.

Fog metadata only times a presentation effect on upcoming words. It never hides the current
character or changes typing validity. The UI, accessibility, announcements and equivalent bot
disadvantage are future integration work, not validated by these tests.

No Web, database, migration, existing reducer, bot scheduler or text-generator implementation
was changed. BONUS-02/04 remain partial until integration and end-to-end validation.
