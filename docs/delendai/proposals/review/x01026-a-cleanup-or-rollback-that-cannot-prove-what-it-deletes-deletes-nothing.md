---
id: x01026
title: "A cleanup or rollback that cannot prove what it deletes deletes nothing"
kind: fix
status: review
type: proposal
track: general
date: 2026-11-04
last-transition-id: 55877da7-1f6e-450f-bd58-9f781862b041
last-correlation-id: 55877da7-1f6e-450f-bd58-9f781862b041
last-transition-from: in-progress
last-transition-at: 2026-11-18T08:20:10.305Z
shipped-in:
  - "d75a6020caca3c7a862ef88e7204612eacb33d36"
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
- **Status**: done
- **Files**: `tools/scripts/reclaim/reclaim-worktrees.script.ts`, `tools/scripts/reclaim/reclaim-worktrees.interface.ts`, `tools/scripts/reclaim/reclaim-worktrees.script.spec.ts`
- **Gate**: type
- acceptance:
  - "A git status that fails or times out makes the worktree unknown, the report says so, and apply never removes it."
  - "git worktree remove --force is used only on a worktree whose clean state was read, not assumed."
  - "A spec simulates the failing git status."
- shipped-in: `f52293358229`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: approved by mimo-v2.6-flash — verified at d75a6020caca, validate exit 0 and tests 33/33 claimed, no recorded run cited; acceptance 3/3: (1) readDirtyPaths returns null when gitRead fails or hits its 60s timeout; judgeWorktrees maps null to role `unknown` with reason "git could not say whether it ho… (2) the only `git worktree remove --force` in reclaim-worktrees.script.ts is inside `for (const verdict of reclamation.spent)`; `spent` is returned only after the … (3) reclaim-worktrees.script.spec.ts has `is null, not zero, when git status cannot run` (readDirtyPaths on a nonexistent path) and `observe reads dirt, delivery a… — Approved at d75a6020ca, the merge that delivered x01026 and an ancestor of develop. Validation: `bun run typecheck`, the slice's declared gate, exits 0 across all 80 workspaces — that is the --validate-exit above. Tests: 33/33 in reclaim-worktrees.script.spec.ts, plus 7/7 rollback and 11/11 migration-transaction, all green. Full `bun run validate` was also run: 133 of its 134 steps pass and the single failure is `lint:closed-with-independent-approval`, a false positive on this review unit's own work ref (kindOfRef/agentOfRef still parse the legacy <agent>/<kind>/... work shape while f00808 S8 made work refs <kind>/<agent>/...), so validate cannot be green inside any review unit; filed separately. Earlier full runs also failed only on load-flaky specs (store-concurrency, review-releases, coordination-chaos, engine-factory clock, rebase), each green in isolation. S2 is judged on its own and does not ride on this verdict.

### S2 — The rollback reverts only what the transaction wrote
- **Status**: pending
- **Files**: `packages/core/src/lib/workspace-migration/transaction/rollback.ts`, `packages/core/tests/src/lib/workspace-migration/transaction/rollback.spec.ts`
- **Gate**: type
- acceptance:
  - "The transaction records the files it creates, writes and renames, and the rollback reverts exactly those."
  - "A file written by another process after the backup and before the rollback is still there afterwards."
  - "A spec writes such a file between the backup and the rollback."
- shipped-in: `569c1d67f766`
- review-state: changes_requested
- review-implementer: claude-opus-5-5
- review-reviewer: mimo-v2.6-flash
- review-log: requested_changes by gpt-5.3-codex — Stale review round; rebase on current develop and re-validate this slice with fresh evidence before approval.
- review-log: requested_changes by mimo-v2.6-flash — Acceptance 2 is not met, and the window it names is exactly the one the proposal's `why` names ("a note an agent or another program creates between the backup and a failed migration").

`recordWrittenSince` runs in the `finally` of `apply`, so it is a filesystem DIFF against the backup, not a record of the operations the transaction performed: anything another program creates while `apply` runs is present after `apply`, absent from the backup, and therefore recorded as the transaction's own work. `rollback` then deletes it because its hash still matches the record.

Reproduction (deterministic, no timers): wrap `createDefaultPhases` so that right after `base.backup` returns — before `apply` starts — a foreign `other/note.md` is written, then let `apply` write `config.json` and throw. `runMigrationTransaction` reports `rolled-back` and `other/note.md` is gone afterwards. A control case writing the same file AFTER `apply` returns (the window the shipped spec covers) survives. The shipped spec `leaves a file another process wrote after the backup` writes the file only after it calls `recordWrittenSince` itself, so it exercises the narrow window and misses the one in `why`.

What must hold: the rollback reverts only operations the transaction itself recorded — write/rename/delete as they happen, or an equivalent per-operation record — so a file created between the backup and a failed `apply` is still there afterwards. The spec should write the foreign file between the backup and `apply`, not after the record is taken.

## acceptance

- A git status that fails or times out makes the worktree unknown, the report says so, and apply never removes it.
- git worktree remove --force is used only on a worktree whose clean state was read, not assumed.
- A spec simulates the failing git status.
- The transaction records the files it creates, writes and renames, and the rollback reverts exactly those.
- A file written by another process after the backup and before the rollback is still there afterwards.
- A spec writes such a file between the backup and the rollback.
