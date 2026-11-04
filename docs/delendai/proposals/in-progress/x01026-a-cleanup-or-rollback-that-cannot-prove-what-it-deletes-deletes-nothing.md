---
id: x01026
title: "A cleanup or rollback that cannot prove what it deletes deletes nothing"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-04
last-transition-id: 52691762-d250-4e86-8640-c84ee20f73ea
last-correlation-id: 52691762-d250-4e86-8640-c84ee20f73ea
last-transition-from: ready
last-transition-at: 2026-11-04T11:19:44.741Z
---

# x01026 — A cleanup or rollback that cannot prove what it deletes deletes nothing

## goal

The standalone worktree reaper keeps a worktree whenever git cannot say whether it holds uncommitted work, and a workspace-migration rollback reverts only what its own transaction wrote, never a file another process created after the backup.

## why

External review in a ChatGPT conversation about develop (reviewer active 2026-10-20 to 2026-10-29). Remark of 2026-10-20 (P0): the worktree reclaim script swallows every git error into an empty string, so a failed git status reads as no changes and the worktree is removed with --force. After x00948 was closed the reviewer repeated it on 2026-10-25, 2026-10-27 and 2026-10-29 as still P1: the standalone script was not changed. Remark of 2026-10-25: the rollback no longer deletes .git (x00945 fixed that P0), but it still removes every file in scope that is absent from the backup, so a note an agent or another program creates between the backup and a failed migration is deleted; the reviewer asked to revert only the operations the transaction recorded. Repeated 2026-10-27 and 2026-10-29. Verified in the code on develop (3188f9414, 2026-11-04): tools/scripts/reclaim/reclaim-worktrees.script.ts git() still returns '' on error (lines 66-75), dirtyPaths comes from it (line 248) and apply runs 'git worktree remove --force' (line 296); packages/core/src/lib/workspace-migration/transaction/rollback.ts lines 99-108 still rm every scanned file not in the backup. x00945 and x00948 are done and do not cover these two residues. Product principles (AGENT-BOOTSTRAP section 0): robust, no work is lost; bounded.

## non-goals

- Changing the worktree role classification (main, current, locked, dirty, undelivered, active, spent).
- Changing the atomic writes or the .git exclusion of the rollback.

## slices

- global_gate: type

### S1 — The reaper keeps a worktree it could not read
- **Status**: pending
- **Files**: `tools/scripts/reclaim/reclaim-worktrees.script.ts`, `tools/scripts/reclaim/reclaim-worktrees.interface.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A git status that fails or times out makes the worktree unknown, the report says so, and apply never removes it."
  - "git worktree remove --force is used only on a worktree whose clean state was read, not assumed."
  - "A spec simulates the failing git status."

### S2 — The rollback reverts only what the transaction wrote
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/transaction/rollback.ts`, `packages/core/tests/src/lib/workspace-migration/transaction/rollback.spec.ts`
- **Gate**: type
- acceptance:
  - "The transaction records the files it creates, writes and renames, and the rollback reverts exactly those."
  - "A file written by another process after the backup and before the rollback is still there afterwards."
  - "A spec writes such a file between the backup and the rollback."

## acceptance

- A git status that fails or times out makes the worktree unknown, the report says so, and apply never removes it.
- git worktree remove --force is used only on a worktree whose clean state was read, not assumed.
- A spec simulates the failing git status.
- The transaction records the files it creates, writes and renames, and the rollback reverts exactly those.
- A file written by another process after the backup and before the rollback is still there afterwards.
- A spec writes such a file between the backup and the rollback.
