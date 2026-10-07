---
id: x00797
title: "A checkpoint inside a unit worktree is refused, and a publication opens its pull request from a checkout that survives"
kind: fix
status: done
type: proposal
track: general
date: 2026-10-01
last-transition-id: 5e486202-df54-4158-afba-33098e186ee6
last-correlation-id: 5e486202-df54-4158-afba-33098e186ee6
last-transition-from: review
shipped-in:
  - "0442b28de"
---

# x00797 — A checkpoint inside a unit worktree is refused, and a publication opens its pull request from a checkout that survives

## Goal

Every configured profile works end to end for any agent that stands in its unit worktree: a checkpoint taken there never leaves the worktree with phantom edits, and publishing from there removes the worktree and the work ref and opens the pull request, with a skip that says what it saw.

## why

Two bugs found by agents. A checkpoint run from inside the unit worktree wrote the very ref checked out there with a private index, so the worktree's HEAD moved under an index that never learned of it; the worktree then showed phantom uncommitted changes and publish refused to remove it. And publish removes the unit's worktree, which can be the directory the command runs in; the git and forge calls that follow ran from that deleted directory, so the remote URL read as empty, the pull request was skipped as "not a GitHub remote", the work ref was left behind, and agents opened pull requests by hand, a second author for one publication.

## Architecture

- The checkpoint engine refuses a ref that its own checkout is attached to, naming the remedy: commit there with git, staging only the unit's paths. The work-unit checkpoint refuses earlier, from any checkout standing on a work ref, before the anchor check can mislead. A checkout that is not on the work ref checkpoints as before.
- Publish asks git and the forge from the repository's own checkout, which outlives every linked worktree.
- A skipped pull request reports the URL it saw, and points at the machine holding the forge credential, never at opening it by hand. The served workflow text for worktree profiles says to commit with git inside the worktree.

## non-goals

- Making a checkpoint refresh the index of a worktree that holds the ref: a checkpoint is base plus exactly its paths, so it would also drop whatever git committed there outside them.
- Changing which remote publish resolves or how the pull request is titled.

## Slices

- global_gate: none

### S1 — Checkpoint and publish are safe from inside the unit worktree
- **Status**: done
- **Files**:
  - `packages/core/src/lib/wip-engine/checkpoint.ts`
  - `packages/core/src/lib/work-units/work-unit-checkpoint.service.ts`
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/core/src/lib/work-units/work-unit-shared.service.ts`
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/src/lib/development-policy/declare-workflow.ts`
  - `packages/core/tests/src/lib/wip-engine/checkpoint.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit-profiles.spec.ts`
- **Gate**: type
- shipped-in: `0442b28dee5d`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at 0442b28de, validate exit 0, tests 36/36 — Delivered by #710 (merge 0442b28de). Proposal acceptance, run for each profile in work-unit-profiles.spec: 'checkpoint from inside the unit worktree is refused and leaves it exactly as it was'; 'publish from inside the unit worktree removes it and opens the pull request of an ssh-style origin'; 'names the URL it saw when the remote is not GitHub, and never invites opening the pull request by hand'. checkpoint, publication-pull-request and work-unit-profiles specs 36/36.

## acceptance

- Under shared-checkout-pr and worktree-pr, a checkpoint from inside the unit worktree is refused with the commit-with-git remedy and leaves HEAD, the ref and the status unchanged.
- Under both, publish run from inside the unit worktree removes the worktree and the work ref and, for an ssh-style GitHub origin, opens the pull request.
- A non-GitHub remote is skipped with its URL in the reason and no invitation to open the pull request by hand.
