---
id: x01078
title: "A change runs the specs of what imports it"
kind: fix
status: done
type: proposal
track: general
date: 2026-11-16
last-transition-id: a2c6c242-39a0-4401-9c9d-9f2015964c46
last-correlation-id: a2c6c242-39a0-4401-9c9d-9f2015964c46
last-transition-from: review
last-transition-at: 2026-11-18T04:15:06.060Z
shipped-in:
  - "997e1759d05a99d7893d206ffebcbe7495f1de86"
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
- **Status**: done
- **Files**: `tools/scripts/ci/test-scope.ts`, `tools/scripts/ci/test-scope.spec.ts`, `packages/cli/src/commands/work.command.spec.ts`, `packages/cli/src/commands/work-enter.command.e2e.spec.ts`
- **Gate**: none
- acceptance:
  - "`bunx vitest run tools/scripts/ci/test-scope.spec.ts` passes a case where the file set of #2231 selects `packages/cli/src/commands/work.command.spec.ts`."
  - "The same spec proves a barrel importer is not followed and a non-importer is not selected."
  - "`bunx vitest run packages/cli/src/commands/work.command.spec.ts` passes with the `--kind` flag expected for implement and create branches."
- shipped-in: `0b4a8ff3e397`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: mai-code-2
- review-log: approved by mai-code-2 — verified at 997e1759d05a, validate exit 0 and tests 37/37 claimed, no recorded run cited; acceptance 3/3: (1) The repository fixture in touchedSpecsOf uses #2231's changed work-deliver service and tracked files; it asserts the exact work.command.spec.ts plus service sp… (2) The direct-importer fixture asserts the source mirror user spec is selected while the barrel-user mirror is absent; existing non-importer and one-hop tests cov… (3) The E2E companion reads implement/create work refs and asserts `--kind=implement`/`--kind=create`; work.command.spec.ts also passes all 19 cases. The combined … — Reviewed the delivered commit and the later commits listed by the queue. Those later changes extend the work-command family but do not refute this slice; the exact three named specs currently pass 37/37. The selector follows one direct non-barrel importer and the unit flags now include implement/create kind as intended.

## acceptance

- The two failing `work.command.spec.ts` cases pass under the contract that a unit's flags carry its kind.
- `bun run lint:architecture` and `bun run proposal-hygiene` exit 0.
