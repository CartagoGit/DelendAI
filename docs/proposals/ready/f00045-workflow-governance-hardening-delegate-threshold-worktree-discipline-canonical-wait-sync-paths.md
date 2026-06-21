---
id: f00045
status: ready
type: proposal
track: proposals-plugin+workflow+skills+docs
date: 2026-06-21
---

# f00045 — Workflow governance hardening — delegate threshold, worktree discipline, canonical wait/sync paths

## Goal

Close the workflow-level gaps surfaced by a00027 S2: make the multi-agent path less dependent on operator discipline by tightening the canonical contract for when to delegate, when a worktree is required, what to do when all slices are claimed, and when sync_proposals is allowed inside swarm work.

## Slices

- global_gate: type

### S1 — Canonical workflow contract in docs and skills
- files: AGENTS.md
- files: CLAUDE.md
- files: skills/proposal-swarm-runner/SKILL.md
- files: skills/state-repair-playbook/SKILL.md
- files: plugins/proposals/src/lib/knowledge/proposal-workflow.ts
- gate: lint
- acceptance:
  - "The repo documents one canonical path for claim → wait/await_lock → delegate → close_slice → sync_proposals with no conflicting swarm narratives."
  - "The docs make explicit when worktree usage is mandatory vs merely recommended, and when the main thread must delegate non-trivial work."
  - "The all-claimed path is documented in one short, operator-facing decision tree."
- status: pending

### S2 — Runtime enforcement for non-trivial delegation and wait path
- files: plugins/proposals/src/lib/tools/auto-work.tool.ts
- files: plugins/proposals/src/lib/tools/continue-proposal.tool.ts
- files: plugins/proposals/src/index.ts
- files: plugins/notification/src/lib/tools.ts
- depends_on: [S1]
- gate: type
- acceptance:
  - "auto_work exposes the same non-trivial threshold the docs prescribe and points to one canonical wait path when work is blocked by claims."
  - "continue_proposal and notification surfaces no longer disagree about what to do when all slices are claimed."
  - "The runtime guidance for sync_proposals is consistent with the documented swarm contract."
- status: pending

### S3 — Worktree discipline and validation coverage
- files: plugins/proposals/src/lib/tools/agent-worktree.tool.ts
- files: plugins/proposals/tests/src/lib/tools/auto-work.tool.spec.ts
- files: plugins/proposals/tests/src/lib/tools/continue-proposal.tool.spec.ts
- files: plugins/notification/tests/src/lib/tools.spec.ts
- depends_on: [S2]
- gate: type
- acceptance:
  - "A 2+ agent workflow has an enforced or test-covered worktree discipline rather than a best-effort recommendation only."
  - "Tests cover delegate threshold, blocked/all-claimed wait guidance, and the no-sync-before-final-close rule where applicable."
  - "bun run validate is green."
- status: pending
