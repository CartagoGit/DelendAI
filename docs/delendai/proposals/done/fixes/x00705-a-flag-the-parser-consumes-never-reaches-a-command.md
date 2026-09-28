---
id: x00705
title: "A flag the parser consumes never reaches a command"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00689, x00553]
last-transition-id: 5d971632-c6be-4f25-bf31-4116b67876ab
last-correlation-id: 5d971632-c6be-4f25-bf31-4116b67876ab
last-transition-from: in-progress
---

# x00705 — A flag the parser consumes never reaches a command

## goal

A command reads a global flag from `globals`, where the parser puts it,
and never from its arguments, where it never arrives. A command's own
flag never shares a name with a global one.

## why

The parser takes `--workspace`, `--remote`, `--format`, `--lang`,
`--plugins`, `--preset`, `--config`, `--json` and `--no-color` out of
every command's arguments. Four commands read one from `args` anyway, so
the flag was silently dropped:

- `repair resolve --workspace=<unit>` wrote to the cwd. From the shared
  checkout, the refusal that told you to pass `--workspace` refused
  again. This was found unblocking a server a swarm had left DEGRADED on
  2026-09-27.
- `work publish --remote=<r>` pushed to the integration remote whatever
  was named.
- `proposals plan|create|task-queue --json=<payload>`: `plan` requires
  it, so it could not be run from the CLI at all.
- `memory import|export --format=json|ndjson` never set the format.

Each spec passed the flag straight to `command.run`, a call the real
parser never makes, so every one of them was green.

## why this design

- **One list.** The parser exports `CONSUMED_GLOBAL_FLAGS`. A spec scans
  every command source and fails on a read of any of them from `args`;
  it asserts it scanned files.
- **Renamed, not special-cased.** The colliding command flags become
  `--slices=`, `--params=` and `--snapshot-format=`. A flag means one
  thing. The old spellings never worked, so no caller depends on them.
- **Specs model the parser.** Command specs pass globals in `globals`.
- **Specs see what CI sees.** Every git a test spawns reads neither the
  global nor the system git config (`hermetic-git-setup.ts`). Two guard
  specs passed in CI and failed on any machine with a global identity,
  since x00698 reads it; the full run before this push showed it.

## non-goals

- Changing which flags are global.

## architecture

- `packages/cli/src/contracts/constants/cli-global-flags.constant.ts`:
  `GLOBAL_FLAGS_WITH_VALUE` and `CONSUMED_GLOBAL_FLAGS`.
- `repair.command.ts`, `work.command.ts`: read `ctx.globals`.
- `groups/proposals.ts`, `groups/memory.ts`: renamed flags.
- `kpis-options.ts`, `groups/router-dashboard.ts`: dead `--json` reads
  removed.

## Slices

- global_gate: none

### S1 — Commands read globals from globals

- **Status**: review
- **Gate**: `npx vitest run packages/cli/src/lib/parser.service.spec.ts packages/cli/src/commands`
- **Files**:
  - `packages/cli/src/contracts/constants/cli-global-flags.constant.ts`
  - `packages/cli/src/lib/parser.service.ts`
  - `packages/cli/src/lib/parser.service.spec.ts`
  - `packages/cli/src/commands/repair.command.ts`
  - `packages/cli/src/commands/repair.command.spec.ts`
  - `packages/cli/src/commands/work.command.ts`
  - `packages/cli/src/commands/work.command.spec.ts`
  - `packages/cli/src/commands/groups/proposals.ts`
  - `packages/cli/src/commands/groups/proposals.spec.ts`
  - `packages/cli/src/commands/groups/memory.ts`
  - `packages/cli/src/commands/groups/memory.spec.ts`
  - `packages/cli/src/commands/groups/router-dashboard.ts`
  - `packages/cli/src/commands/kpis-options.ts`
  - `packages/cli/src/commands/kpis.command.spec.ts`
  - `tools/scripts/lib/hermetic-git-setup.ts`
  - `vitest.shared.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- `repair resolve --workspace=<unit>` from the shared checkout records in
  the unit. Without the fix the spec fails.
- The guard spec fails on develop's `repair.command.ts`.
- `proposals plan --slices='[…]'` reaches the tool.
