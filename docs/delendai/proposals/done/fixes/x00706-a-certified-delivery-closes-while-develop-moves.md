---
id: x00706
title: "A certified delivery closes while develop moves"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-27
priority: P0
related: [x00700, x00696]
last-transition-id: 051c8b3d-9a38-4cd4-ad8d-6c1ebaac1100
last-correlation-id: 051c8b3d-9a38-4cd4-ad8d-6c1ebaac1100
last-transition-from: review
shipped-in:
  - "5c4e13ec85acecb0c9b91daa2bad90752178c827"
---

# x00706 — A certified delivery closes while develop moves

## goal

An approved proposal whose shipped commits are contained in a green
certified run of the integration branch closes. The branch may have moved
on since that run.

## why

The owner machine's closer (x00700) found 37 approved proposals in
`review/` on 2026-09-27 (x00555, x00649–x00692). Every pass refused every
close with `validate required … never-ran`. Its unit is a fresh worktree
with no local validate, and the certification path demanded that the
newest certified run be of the integration branch's current commit. A run
is recorded as certified when the next merge's hydration observes it, and
by then the tip has moved. In a branch that merges every few minutes the
condition is never met. The closer also printed only "every close was
refused", so nobody could see why. Proposals looked stuck in review and
reviewers were blamed.

## why this design

- **The newest verdict must still be green.** A later red run still stops
  every close, so an older green run never vouches for a branch gone red.
- **Of a commit on the integration branch.** The certified commit must be
  the tip or an ancestor of it. A certification of a commit the branch
  never had vouches for nothing.
- **Containing every shipped commit**, as before.
- **Merges after it are not the proposal's work.** If they break it,
  their own run goes red and the newest verdict stops vouching.
- **A refusal is printed with its reason**, per proposal.
- **A refused pass leaves nothing behind.** Its empty unit branch is
  deleted with its worktree. Every refused pass had left one for the reaper.

## non-goals

- Changing when certification is recorded.

## architecture

- `plugins/proposals/src/lib/services/integration-certification-evidence.service.ts`
- `tools/scripts/proposals/close-approved-proposals.script.ts`: `refusalOf`.

## Slices

- global_gate: none

### S1 — Approved work closes

- **Status**: done
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/integration-certification-evidence.service.spec.ts tools/scripts/proposals/close-approved-proposals.script.spec.ts`
- **Files**:
  - `plugins/proposals/src/lib/services/integration-certification-evidence.service.ts`
  - `plugins/proposals/tests/src/lib/services/integration-certification-evidence.service.spec.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.ts`
  - `tools/scripts/proposals/close-approved-proposals.script.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-transition.tool.spec.ts`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5-5, reviewer minimax-3. Verifiqué 5c4e13ec85. PR MERGED. Approved work closes
## dependency graph

None.

## acceptance

- A certified ancestor of the tip containing the shipped commit vouches.
  A certified commit off the branch, a red newest verdict, or a certified
  run lacking the shipped commit does not.
- Probed on the real repository: `transition-proposal x00649 done` in a
  fresh worktree off develop is refused before the fix and closes with it.
- The closer prints each refusal's reason.
