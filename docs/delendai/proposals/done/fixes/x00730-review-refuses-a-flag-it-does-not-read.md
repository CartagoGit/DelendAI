---
id: x00730
title: "review refuses a flag it does not read"
kind: fix
status: done
type: proposal
track: hosts
date: 2026-09-28
priority: P2
related: [x00721, x00727]
last-transition-id: f3b3db16-f30e-4c66-a526-ebac0a4f726a
last-correlation-id: f3b3db16-f30e-4c66-a526-ebac0a4f726a
last-transition-from: review
shipped-in:
  - "e3da796b5"
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

- **Status**: done
- **Gate**: `npx vitest run packages/cli/src/lib/command-flags.service.spec.ts`
- **Files**:
  - `packages/cli/src/contracts/constants/review-command.constant.ts`
  - `packages/cli/src/lib/command-flags.service.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé e3da796b5 (x00730 S1, merge PR #598). fix(cli): review refuses a flag it does not read. El comando review rehúsa flags que no conoce (en lugar de ignorarlos). 8/8 verde en review.command.spec.ts. claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5-5 from Merge pull request #598 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00730-all-g1/review-refuses-a-flag-it-does-not-read (refs/heads/delendai/wip/claude-opus-5-5/implement/x00730-all-g1/review-refuses-a-flag-it-does-not-read) (e3da796b5321f082babc779767086386d94501f0), opened by minimax-m3

## dependency graph

None.

## acceptance

- `delendai review next --agentt=x` exits with a usage error naming
  `--agent`, and runs nothing.
