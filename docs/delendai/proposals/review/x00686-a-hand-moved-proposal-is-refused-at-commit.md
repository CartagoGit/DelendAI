---
id: x00686
title: "A hand-moved proposal is refused at commit"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-27
priority: P1
related: [x00685]
last-transition-id: 3c6d15f4-3f3f-4db2-8287-e76e1aca14ee
last-correlation-id: 3c6d15f4-3f3f-4db2-8287-e76e1aca14ee
last-transition-from: in-progress
---

# x00686 — A hand-moved proposal is refused at commit

## goal

A commit in which a proposal sits in a folder its status does not name
is refused before it is made, with the command that moves proposals
correctly.

## why

On 2026-09-27, MiniMax's branch `delendai/wip/minimax-3/review/f00553-review-g1/review`
committed "close 100+ ready-to-close proposals": 131 files moved into
`done/` with `git mv` (renames only), their frontmatter still
`status: review`. `proposal_transition` never ran, so:

- the index and the state database were not updated;
- no `shipped-in` was recorded;
- the review rounds were never checked.

Nothing refused it at commit time. `lint:proposal-folder-drift` runs only
in CI (`lint:proposals`), so the branch went red after the push (#514).
Meanwhile the owner saw proposals whose Markdown and folder disagree.

## why this design

- **Refuse where it is cheap.** The existing folder-drift lint takes
  under a second. It now runs in pre-commit whenever a proposal file is
  staged, and says what to use instead: `proposal_transition` (MCP) or
  `delendai proposals transition`.

## non-goals

- Repairing MiniMax's branch. Its closes need real transitions, which
  check review approvals and `shipped-in`.

## architecture

- `lefthook.yml`: `proposal-folder-drift` in pre-commit.
- `tools/scripts/lint/proposal-folder-drift.script.ts`: the guidance on
  failure.

## Slices

- global_gate: none

### S1 — Folder drift is refused at commit

- **Status**: review
- **Gate**: `bun tools/scripts/lint/proposal-folder-drift.script.ts`
- **Files**:
  - `lefthook.yml`
  - `tools/scripts/lint/proposal-folder-drift.script.ts`
- review-state: in_review
- review-implementer: claude-opus-5-5
## dependency graph

None.

## acceptance

- Moving a review proposal into `done/` with `git mv` and committing is
  refused by pre-commit, naming the proposal and the transition command.
  Verified by running the hook on that exact change.
