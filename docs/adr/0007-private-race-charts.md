# ADR-0007 — Private expected-character counts and per-race charts

Status: implemented within the approved #66A/#66B scope; not merged.
Date: 2026-10-28.

## Context

RES-03 requires all entrants' WPM curves and a personal missed-key map. The engine
already keeps cumulative missed expected graphemes. Final scores cannot reconstruct
either the time series or the per-character errors. Older races may lack these data.

## Decision

- Persist a versioned aggregate, not the chronological input stream, in
  `race_key_errors`, atomically with the final result. A composite result foreign
  key cascades deletion. Version 1 is a list of unique NFC expected graphemes and
  positive counts; their sum must match the official wrong insertion count.
- Filter the aggregate in SQL by the authenticated account, before projecting
  `personalKeyErrors`. Other entrants' series remain part of the existing authorized
  result view, but their error aggregates never do. Anonymous public access is not added.
- A missing aggregate means uncollected data. An empty collected aggregate means
  zero errors. Never backfill estimates from the final WPM, accuracy or current text.
- Render charts on the persisted race detail page. Each real stored observation is
  plotted; connecting segments are expressly described as such, not extra samples.
  Stop each line at its own final observation. Provide an individual view and a
  numerical table per entrant so overlapping curves remain readable.
- Use the supplied screen 11 AZERTY drawing as a visual reference, not a claim about
  physical keyboard layout. Accents, uppercase and space remain distinct; additional
  graphemes have their own cells and rows. The engine counts expected text, not scan
  codes. Display counts, not invented error percentages without a denominator.
- Keep the interface server-rendered, with native disclosures, focusable scroll
  regions and exact count tables. Narrow viewports scroll inside charts/keyboard,
  not the page. This preserves readable labels instead of shrinking them to a few
  pixels. Token colours, typography and surfaces follow screens 10/11.

## Consequences

No client chart dependency, new endpoint, profile aggregation or coaching is needed.
An old race cannot acquire a retroactive heatmap. A zero cell does not prove that
character was practised; the UI says so. Native tables remain usable without JavaScript.
Bot identity comes from the frozen kind/level, not the name; bots have no private
account heatmap. Guests remain outside this tranche.

Migration 0010 follows coordinated 0009; deploy schema before code. Code rollback
retains data and the additive table. Production migrations remain a separate human
authorization. No recipe database reset or migration is part of this implementation.
