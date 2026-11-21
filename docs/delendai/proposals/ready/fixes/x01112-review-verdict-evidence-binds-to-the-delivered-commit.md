---
id: x01112
title: "Review verdict evidence binds to the delivered commit"
kind: fix
status: ready
type: proposal
track: review-mechanics
date: 2026-11-21
---

# x01112 — Review verdict evidence binds to the delivered commit

## goal

Make proposal review evidence reproducible and impossible to detach from the exact delivering commit.

## why

While reviewing x01016, a 42-test pass was observed in the current review worktree, whose HEAD is far ahead of the delivery commit 4a56f443ac5a. The delivery commit changes only tools/scripts/typecheck.script.ts, while the passing tests exercise current worktree files and do not prove the shipped commit. This permits green evidence to be recorded against a slice even when the delivery did not contain the implementation.

## non-goals

- Weakening review independence or acceptance criteria
- Changing proposal status transitions beyond evidence validation
- Creating a second source of truth for commit or test metadata

## slices

- global_gate: type

### S1 — Bind review evidence to the exact delivery
- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/authoring/proposal-review.tool.ts`, `plugins/proposals/src/lib/tools/authoring/review-verdict-support.tool.ts`, `plugins/proposals/src/lib/services/review-procedure.ts`, `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- **Gate**: type
- **Decisions**: Define a delivery snapshot that verifies commitHash exists, resolves to the exact delivered diff, and pins test execution to that snapshot.
- acceptance:
  - "A stale worktree or post-delivery drift makes review-verdict-evidence.spec.ts return verifiable=false instead of recording approval or request_changes evidence."
  - "A Scenario in review-verdict-evidence.spec.ts proves that a verdict is rejected when commitHash and test evidence do not resolve to the same delivering commit."

## acceptance

- A stale worktree or post-delivery drift makes review-verdict-evidence.spec.ts return verifiable=false instead of recording approval or request_changes evidence.
- proposal-review.tool.ts and review-verdict-support.tool.ts reject a verdict when commitHash and test evidence do not resolve to the same delivering commit.
