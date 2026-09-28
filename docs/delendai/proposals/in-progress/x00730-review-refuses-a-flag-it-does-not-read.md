---
id: x00730
title: "review refuses a flag it does not read"
kind: fix
status: in-progress
type: proposal
track: hosts
date: 2026-09-28
priority: P2
related: [x00721, x00727]
---

# x00730 — review refuses a flag it does not read

## goal

`delendai review` declares its flags like `work` and `proposals`, so a flag
it does not read is refused with the one most likely meant, and `review
--help` lists them.

## why

x00727 (`delendai review`) and x00721 (declared flags) landed
independently, so `review` had no declaration: `review next --agentt=x`
ran as if no agent had been given.

## why this design

- The flags join `REVIEW_COMMAND`, the descriptor the command and its lazy
  entry share.
- The spec that reads `work`'s whole module for the flags it reads now
  reads `review`'s too, and `review` is among the commands reviewers use
  that must declare their flags.

## non-goals

None.

## architecture

- `packages/cli/src/contracts/constants/review-command.constant.ts`,
  `packages/cli/src/lib/command-flags.service.spec.ts`.

## Slices

- global_gate: none

### S1 — review declares its flags

- **Status**: in-progress
- **Gate**: `npx vitest run packages/cli/src/lib/command-flags.service.spec.ts`
- **Files**:
  - `packages/cli/src/contracts/constants/review-command.constant.ts`
  - `packages/cli/src/lib/command-flags.service.spec.ts`

## dependency graph

None.

## acceptance

- `delendai review next --agentt=x` exits with a usage error naming
  `--agent`, and runs nothing.
