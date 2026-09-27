---
id: x00712
title: "Validate runs the gates the project declares"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-28
priority: P0
related: [x00706, x00692, x00681]
last-transition-id: 8c9d9a77-0118-471a-8212-7d0fd9aa708d
last-correlation-id: 8c9d9a77-0118-471a-8212-7d0fd9aa708d
last-transition-from: in-progress
---

# x00712 — Validate runs the gates the project declares

## goal

In any project, a reviewer can produce the validation evidence a close
needs, and the refusal tells it how.

## why

Driven end to end in a throwaway consumer repository on 2026-09-28, a
reviewer (`model-b`) approved an implementer's (`model-a`) proposal and
the close was refused: "No validate run has been journalled". The
journal was written only by this repository's own
`record-validate-evidence` script, and `delendai validate` ran
`bun run validate` whatever the project was. That script does not exist
elsewhere, so outside this repository no reviewer could ever close a
proposal. The refusal then told it to run `bun run validate` too.

## why this design

- **The project declares its gates.** `validationMatrix.scopes` in
  `delendai.config.json` already existed and was surfaced by
  `get_validation_matrix`. `delendai validate` now runs every declared
  command. Without a matrix it runs the project's own `validate` script
  with the package manager its lockfile names. With neither it refuses
  and says what to declare. It never guesses `bun`.
- **One writer, beside its reader.** The journal writer moved from this
  repository's script into the proposals plugin, next to
  `VALIDATE_LOG_RELATIVE_PATH`. The script and the CLI both journal
  through it.
- **Every gate runs**, and a failure names the ones that failed.
- **Refusals name `delendai validate`**, not this repository's script.

## non-goals

- The `bun run validate` defaults `init` writes into a new project's
  instructions and gates. They come next.

## architecture

- `plugins/proposals/src/lib/shared/validate-journal.ts` (+ interface), exported publicly.
- `packages/cli/src/lib/validate-run.service.ts` (+ interface); `validate` in `registry.ts`.
- `tools/scripts/proposals/record-validate-evidence.script.ts` re-exports the writer.
- `plugins/proposals/src/lib/services/validate-blocker.ts`, `authoring.tool.ts`: refusals.

## Slices

- global_gate: none

### S1 — Evidence in any project

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/lib/validate-run.service.spec.ts packages/cli/src/commands/registry.spec.ts plugins/proposals/tests/src/lib/services/validate-blocker.spec.ts tools/scripts/proposals/record-validate-evidence.script.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/shared/validate-journal.ts`
  - `plugins/proposals/src/lib/services/auto-transition.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/validate-journal.interface.ts`
  - `plugins/proposals/src/public/index.ts`
  - `plugins/proposals/src/lib/services/validate-blocker.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/services/validate-blocker.spec.ts`
  - `packages/cli/src/lib/validate-run.service.ts`
  - `packages/cli/src/lib/validate-run.service.spec.ts`
  - `packages/cli/src/contracts/interfaces/validate-run.interface.ts`
  - `packages/cli/src/commands/registry.ts`
  - `packages/cli/src/commands/registry.spec.ts`
  - `tools/scripts/proposals/record-validate-evidence.script.ts`
  - `tools/scripts/proposals/record-validate-evidence.script.spec.ts`
  - `plugins/proposals/tests/src/lib/auto-transition.spec.ts`

## dependency graph

None.

## acceptance

- In a consumer repository with no bun and no validate script, a declared
  gate runs, the journal records a pass, and a proposal approved by
  another agent closes to `done/`. Driven for real on 2026-09-28.
- A failing gate is journalled as `fail`, naming it. Nothing declared is
  refused with what to declare.
