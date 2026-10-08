<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Incision rules for this app

- Do not call `notFound()` from a page. In Next 16.3.7 and 16.4.0 (checked on October 7, 2026 with a probe page, inside and outside the `(site)` group) it answers with Next's bare error document (`<html id="__next_error__">`): the server HTML has no theme attributes and no inline theme script (DES-05), the not-found UI exists only in the payload that JavaScript renders, and nothing shows without JavaScript. Render the state in the page instead (as `/rooms/[code]` does with screen 15's "code not found"); unknown URLs still get `app/not-found.tsx`, which renders on the server (`e2e/design.spec.ts` checks it). Re-check with a probe page after each Next upgrade.
