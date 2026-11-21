---
id: x01120
title: "A proposal moved ready to review in a unit survives a concurrent edit of its ready copy on develop"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-11-21
last-transition-id: 9f89137f-b902-4888-a0fa-6c916d541798
last-correlation-id: 9f89137f-b902-4888-a0fa-6c916d541798
last-transition-from: ready
last-transition-at: 2026-11-21T10:09:03.187Z
---

# x01120 — A proposal moved ready to review in a unit survives a concurrent edit of its ready copy on develop

## goal

When develop edits the ready/ copy of a proposal that a unit moved to review/, the merge ref holds exactly one file for it, so proposal-uniqueness and the proposals lint stay green.

## why

PR #3373 (x01114): the unit moved x01114 from ready/ to review/ while develop concurrently edited the ready/ copy. Git merged the rename and the edit as a modify/delete-style result that keeps both files, so the merge ref has the proposal in two state folders and tools/scripts/lint/proposal-uniqueness.script.ts fails. Root cause hypothesis: a proposal's state is its folder, and git has no notion that the move must win over a later edit of the old path; nothing re-applies the move after develop is merged, and nothing on the unit detects the stale copy before publishing. Checked docs/delendai/proposals: x00529 only made transitions leave no orphan copy inside one tree; no proposal covers the cross-branch merge.

## non-goals

- Changing which folder a status maps to

## slices

- global_gate: none

### S1 — Publishing detects a stale second copy of a moved proposal and re-applies the move
- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-uniqueness.script.ts`, `tools/scripts/lint/proposal-uniqueness.script.spec.ts`, `packages/cli/src/lib/work-deliver.service.ts`, `packages/cli/src/lib/work-deliver.service.spec.ts`, `packages/cli/src/lib/work-deliver-stale-proposal.service.ts`, `packages/cli/src/lib/work-deliver-stale-proposal.service.spec.ts`, `packages/cli/src/contracts/interfaces/work-deliver.interface.ts`, `packages/cli/src/commands/work.command.ts`
- **Gate**: type
- **Decisions**: none
- acceptance:
  - "proposal-uniqueness.script.spec.ts: a tree holding one proposal id in ready/ and review/ is reported with both paths and the folder its frontmatter status names as the one to keep."
  - "work-deliver.service.spec.ts: after develop is merged into a unit whose proposal moved to review while develop edited the ready/ copy, deliver removes the stale ready/ copy, keeping the edits in the review/ file, before it proves; with no stale copy it changes nothing."

## acceptance

- proposal-uniqueness.script.spec.ts: a tree holding one proposal id in ready/ and review/ is reported with both paths and the folder its frontmatter status names as the one to keep.
- work-deliver.service.spec.ts: after develop is merged into a unit whose proposal moved to review while develop edited the ready/ copy, deliver removes the stale ready/ copy, keeping the edits in the review/ file, before it proves; with no stale copy it changes nothing.
