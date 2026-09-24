---
id: f00552
title: "Every fact names its authority, and every copy of it is a declared projection"
kind: feat
status: in-progress
type: proposal
track: architecture
date: 2026-09-23
---

# f00552 — Every fact names its authority, and every copy of it is a declared projection

## goal

For every fact delendai keeps in more than one place, the answer to "which
copy is the truth, what are the others, what rebuilds them, and what
notices when they drift" is written down in code, and checked. Consumer
projects get the same mechanism for the facts delendai keeps in their
repositories. A fact with two copies and no declaration is then a finding,
not something discovered only when it breaks.

## why

Most of the defects fixed over the last three days were one fact stated
in two places that disagreed:

| Fact | The copies that disagreed | Fixed in |
| --- | --- | --- |
| Work-ref shape | engine template vs guard text vs parser | x00610 |
| Plugin defaults | two `PLUGIN_DEFAULTS` maps, opposite paths | x00613 |
| Bundled skills | manifest vs adoption-plan table vs `init` | x00614, x00618 |
| Tool namespace | config vs 80 hard-coded prefixes | x00619 |
| Agent identity | model vs client vs host name | x00617 |
| Catalog wire cost | generated dashboard vs spec literal | x00620 |
| Proposal status | markdown vs registry vs SQLite, refreshed by different writers | x00601, x00621 |
| Where a write lands | server root vs caller's worktree | x00608, x00623 |
| Spend limits | usage-tracking config vs the summary the runner reads | x00624 |

Each fix made one copy the authority and derived the rest. None of them
recorded the decision anywhere a later change could check. The same
review that found several of them names the pattern and asks for this
mechanically: for each domain, AUTHORITY, PROJECTIONS, RECONCILER, DIGEST,
REBUILD and DRIFT GATE.

An undeclared duplicate turned up again while writing x00621. The list
of specs that must run under bun is written in `package.json`
(`test:sqlite`) and again in `plugins/proposals/vitest.config.ts`
(`exclude`). Nothing checks that the two agree, so a spec added to one
and not the other either runs under the wrong runtime or not at all.

This matters twice as much for the direction the store is taking.
Proposals are moving from markdown as the authority to SQLite as the
authority, with the markdown becoming a projection (q00022). That move is
safe only if every reader and writer agrees on which copy is the
authority at each phase. Today that agreement is prose.

## why this design

- **A declaration next to the code that owns the fact.** Core carries
  its own declarations; a plugin declares its own in its manifest; a
  consumer's facts are declared by whatever plugin writes them. That
  keeps it agnostic: the mechanism knows nothing about proposals or
  branches, only about authorities and projections.
- **The declaration is data, then a check.** A generated
  `AUTHORITIES.md` makes it readable. The check does what no lint does
  today: every declared projection names the producer that writes it,
  and that producer exists; every declared drift gate is wired into CI
  (reusing what `lints-reach-ci` already checks); and a rebuild command
  that is declared actually runs.
- **Not a new lint per duplicate.** The external review warned that a
  project with enough lints builds a second interpreter of its own
  architecture. This is one declaration format and one check, replacing
  the habit of adding a textual lint after every divergence.

## non-goals

- Finding every duplicate automatically. The first slices declare the
  known ones; detection can come later, from the declarations.
- Moving the proposal authority to SQLite. That is q00022; this makes
  each of its phases declarable and checkable.

## Slices

- global_gate: none

### S1 — The declaration contract

- **Status**: in-progress
- **Gate**: `npx vitest run packages/core/tests/src/lib/contracts`
- **Files**: `packages/core/src/lib/contracts/interfaces/authority.interface.ts`,
  `packages/core/src/lib/contracts/interfaces/plugin-manifest.interface.ts`,
  `packages/core/src/lib/manifest/define-plugin-manifest.ts`,
  `packages/core/src/public/index.ts`,
  `packages/core/tests/src/lib/contracts/authority.interface.spec.ts`
- `IAuthorityDeclaration { domain, authority, projections: {path,
  producer}[], reconciler?, digest?, rebuild?, driftGate? }`, and a
  plugin-manifest field carrying a plugin's declarations.

### S2 — Delendai declares the facts it already unified

- **Status**: pending
- **Gate**: `bun run gen:all -- --check`
- **Files**: `docs/delendai/AUTHORITIES.md` and the declarations — the
  literal list is recorded when the slice ships
- One declaration for each row of the table above, then `AUTHORITIES.md`
  generated from them.

### S3 — Declarations are checked, not just printed

- **Status**: pending
- **Gate**: `bun run lint:architecture`
- **Files**: the check and its CI wiring — the literal list is recorded when the slice ships
- Each producer exists, each drift gate reaches CI, and each rebuild
  command runs in the check's sandbox.

### S4 — The bun spec list is stated once

- **Status**: pending
- **Gate**: `bun run test:sqlite`
- **Files**: `package.json`, `plugins/proposals/vitest.config.ts`
- One list is the authority and the other is derived from it, declared
  through S1 as the first new entry, so the example that motivated the
  mechanism is also its first user.

## acceptance

- `AUTHORITIES.md` lists every row of the table above, generated rather
  than written.
- Removing a declared projection's producer, or unwiring a declared drift
  gate from CI, fails the check.
- The bun spec list exists once.
