# Contributing to Incision

This guide applies to human contributors and development agents. It describes **how** to work; the [final brief and the requirements matrix](README.md#sources-et-autorité) define **what** to build. Ambiguities are resolved by reasonable choices explicitly recorded in `docs/EXIGENCES.md` (brief §2.2), not by requirements attributed to the client.

## Working language

- **English** for code, identifiers, file and branch names, commit messages, pull requests, agent instructions and the internal technical notes (`docs/architecture/`, the other ADRs).
- **French** for the documents my teacher reads, written in my own voice: `README.md`, `docs/ARCHITECTURE.md`, `docs/EXIGENCES.md`, `docs/DEMARCHE-CREATIVE.md`, `docs/IA.md`, `docs/SETUP.md`, `docs/DEPLOYMENT.md` and the realtime ADR (`docs/adr/0001-realtime.md`).
- French and English are both **product** languages: every user-facing string (labels, errors, empty states, page metadata) lives in the FR/EN i18n dictionaries, never hard-coded (I18N-01).
- Unchanged on purpose: official requirement IDs (`AUTH-01`, `SALLE-02`, `COURSE-04`…), the source PDFs, and the deliverable file names required by the brief: `docs/ARCHITECTURE.md`, `docs/EXIGENCES.md`, `docs/DEMARCHE-CREATIVE.md`, `docs/IA.md`.

## Before coding

1. Re-read the feature card and the requirements it traces. If no card exists yet, document at least the need, its source, the acceptance criteria and the edge cases before any significant implementation.
2. Read the [architecture](docs/ARCHITECTURE.md) and the relevant ADRs. Add an ADR when a lasting decision changes contracts, persistence or operations.
3. Limit the change to one verifiable goal. No "just in case" features and no needs absent from the brief.
4. In `apps/web`, also follow [the local Next.js instructions](apps/web/AGENTS.md), in particular reading the documentation of the installed version before changing its code.

## Code and architecture

- Write product code in TypeScript (`.ts`/`.tsx`) with `strict` enabled. Configuration may be JSON. Do not introduce product JavaScript or disable checks to work around an error.
- A function has one clear responsibility and a name that states its result or effect. Extract a function when it clarifies a rule, eases a test or removes real duplication; do not split every line mechanically.
- Aim for at most **three positional parameters**. Beyond that, revisit the function's responsibility; use a named object when the arguments form a single intent. Do not create a catch-all object to hide too many dependencies.
- Prefer explicit types at boundaries (requests, events, data access, public return values). Treat external data as `unknown` until it is validated by a schema. No explicit `any`: ESLint rule set to error (TECH-02). No TypeScript suppression without a local justification; no assertion to work around missing validation.
- Keep business rules independent of React, the database and the realtime transport. Controllers, components and adapters call these rules; they do not copy them.
- Prefer descriptive names, early returns and explicit error handling over nested conditions, opaque booleans and functions with hidden side effects. Comment the **why** of a non-obvious decision, not a prose translation of the code.
- In React, keep rendering pure, never mutate props or state, and derive computable values instead of duplicating them in another state. Use an effect to synchronise with an external system, not to recompute what rendering can compute. Destructure props when they are used individually; not by reflex if it hurts readability.
- Split server and client components according to their real needs. Reserve client code for interactions and browser APIs; never expose a server secret in a client component.
- For PostgreSQL, version migrations, make transactions explicit for multiple related writes, and check the number of queries when a list or a lobby can hold many participants. No direct production change without a migration and rollback procedure.

These rules aim at readability and correctness. A reasoned, tested exception is better than artificial compliance with a number.

## Verifying a contribution

- Add or update tests in proportion to the risk: business rule, edge case, API/event contract, or affected acceptance path. Do not present a feature as tested if no corresponding test exists.
- From the root, run `npm run check:no-js`, `npm run lint`, `npm run typecheck`, `npm test` and `npm run build` for application changes. CI runs the same commands on every push and pull request (`.github/workflows/ci.yml`). The root scripts skip a workspace that lacks the script, so every workspace defines `lint` and `typecheck`, and `test` once it has tests. A documentation-only change does not need a full build.
- Check error states, reconnection and concurrency for realtime flows. Test keyboard navigation, readability and translation of modified interfaces.
- Never commit `.env`, secrets or real student data. For any change to authentication, authorisation, result sharing or personal data, request a security review before integration.
- Update the card, the matrix and the documentation when shipped behaviour or an architecture decision changes. State honestly what remains unimplemented.

## Git and commits

Create working branches from `dev` (`feat/…`, `fix/…`, `docs/…`). Verified changes are merged into `dev`; a stable release then goes from `dev` to `main`. Do not develop directly on these two branches, nor rewrite their published history. CI runs on every push and PR; only `main`, published after checks, automatically feeds production. The deployment workflow is described in [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md); branch protection still has to be configured, do not assume it is active.

Write focused commits in English using **Conventional Commits**: `type(scope): short description`. Usual types: `feat` (feature), `fix`, `docs`, `test`, `refactor` (no behaviour change), `perf`, `chore`, `build` and `ci`. The scope is optional but useful: `auth`, `rooms`, `db`, `web`, `docs`.

Examples:

```text
feat(rooms): join a room by code
fix(auth): reject an expired session
docs: clarify guest acceptance criteria
chore(config): align tooling on npm and TypeScript
```

A commit describes what it actually contains. Check `git status` and the diff before committing; do not include changes unrelated to the task. An incompatible contract change must be flagged explicitly in the commit or review description.

## Technical references

- [React: choosing the state structure](https://react.dev/learn/choosing-the-state-structure) and [keeping components pure](https://react.dev/learn/keeping-components-pure)
- [TypeScript: strict mode](https://www.typescriptlang.org/tsconfig/strict) and [narrowing](https://www.typescriptlang.org/docs/handbook/2/narrowing)
