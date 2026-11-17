---
id: x01078
title: "A change runs the specs of what imports it"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-16
last-transition-id: e3c4f1b0-6c70-4116-9f78-0366df3fb76f
last-correlation-id: e3c4f1b0-6c70-4116-9f78-0366df3fb76f
last-transition-from: in-progress
last-transition-at: 2026-11-16T04:21:20.777Z
---

# x01078 — A change runs the specs of what imports it

## goal

The default `touched` test scope runs, for a changed source, its mirror or sibling spec, the specs that import it directly, and the mirror specs of the sources that import it directly. Nothing wider. A change to a module a command file imports then runs the command's own spec.

## why

PR #2231 changed `packages/cli/src/lib/work-deliver.service.ts`. `packages/cli/src/commands/work.command.ts` imports it, but its spec `work.command.spec.ts` imports only `work.command.ts`, so the touched scope (mirror plus direct spec importers) selected only `work-deliver.service.spec.ts`. The pull request was green and develop 133cb8a36 failed two `work.command.spec.ts` tests. The owner's standing rule is changed, mirror and direct-importer specs; the selector kept the spec of the changed file but not the spec of its direct importer.

## why this design

Decisions (nothing is left undecided):

- The selector follows exactly one hop through non-barrel sources and takes the importer's mirror spec only; the importer's own importers are not followed.
- Barrels are skipped on both sides: a changed barrel keeps its symbol-delta rule and a barrel importer adds nothing.
- The default scope stays `touched`; `reach` and `all` are unchanged.

## non-goals

- Following imports more than one hop, or moving to the `reach` scope.
- Changing the symbol analysis of `affected-specs.service`.
- Following the importers of a barrel (`index.ts`), which would select every module behind it.

## slices

- global_gate: none

### S1 — The touched scope adds the mirrors of direct importers
- **Status**: review
- **Files**: `tools/scripts/ci/test-scope.ts`, `tools/scripts/ci/test-scope.spec.ts`, `packages/cli/src/commands/work.command.spec.ts`, `packages/cli/src/commands/work-enter.command.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "`bunx vitest run tools/scripts/ci/test-scope.spec.ts` passes a case where the file set of #2231 selects `packages/cli/src/commands/work.command.spec.ts`."
  - "The same spec proves a barrel importer is not followed and a non-importer is not selected."
  - "`bunx vitest run packages/cli/src/commands/work.command.spec.ts` passes with the `--kind` flag expected for implement and create branches."
- shipped-in: `0b4a8ff3e397`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- The two failing `work.command.spec.ts` cases pass under the contract that a unit's flags carry its kind.
- `bun run lint:architecture` and `bun run proposal-hygiene` exit 0.
