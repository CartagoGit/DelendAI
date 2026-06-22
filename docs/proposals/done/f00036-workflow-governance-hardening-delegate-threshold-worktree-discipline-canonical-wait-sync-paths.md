---
id: f00036
kind: feat
title: Workflow governance hardening — delegate threshold, worktree discipline, canonical wait/sync paths
status: ready
type: proposal
track: proposals-plugin+workflow+skills+docs
date: 2026-06-21
---

# f00045 — Workflow governance hardening — delegate threshold, worktree discipline, canonical wait/sync paths

## Goal

Close the workflow-level gaps surfaced by a00027 S2: make the multi-agent path less dependent on operator discipline by tightening the canonical contract for when to delegate, when a worktree is required, what to do when all slices are claimed, and when sync_proposals is allowed inside swarm work.

## why

- The repo already has strong swarm primitives, but a00027 S2 surfaced drift between runtime enforcement and operator guidance.
- The highest-value fix is not a new capability first, but one canonical workflow contract that docs, skills, notifications and proposals runtime all express the same way.
- This proposal keeps that work narrow: governance, enforcement points and validation coverage, not a new orchestration model.

## non-goals

- Replacing the existing lock/notification/worktree architecture.
- Designing a new swarm protocol outside `proposals` and `notification`.
- Expanding into memory policy or token-budget measurement; those belong to sibling follow-ups.

## Slices

- global_gate: type

### S1 — Canonical workflow contract in docs and skills
- **Files**: AGENTS.md, CLAUDE.md, skills/proposal-swarm-runner/SKILL.md, skills/state-repair-playbook/SKILL.md, plugins/proposals/src/lib/knowledge/proposal-workflow.ts
- **Status**: done
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "The repo documents one canonical path for claim → wait/await_lock → delegate → close_slice → sync_proposals with no conflicting swarm narratives."
  - "The docs make explicit when worktree usage is mandatory vs merely recommended, and when the main thread must delegate non-trivial work."
  - "The all-claimed path is documented in one short, operator-facing decision tree."

### S2 — Runtime enforcement for non-trivial delegation and wait path
- **Files**: plugins/proposals/src/lib/tools/auto-work.tool.ts, plugins/proposals/src/lib/tools/continue-proposal.tool.ts, plugins/proposals/src/index.ts, plugins/notification/src/lib/tools.ts
- **Status**: done
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "auto_work exposes the same non-trivial threshold the docs prescribe and points to one canonical wait path when work is blocked by claims."
  - "continue_proposal and notification surfaces no longer disagree about what to do when all slices are claimed."
  - "The runtime guidance for sync_proposals is consistent with the documented swarm contract."

### S3 — Worktree discipline and validation coverage
- **Files**: plugins/proposals/src/lib/tools/agent-worktree.tool.ts, plugins/proposals/tests/src/lib/tools/auto-work.tool.spec.ts, plugins/proposals/tests/src/lib/tools/continue-proposal.tool.spec.ts, plugins/notification/tests/src/lib/tools.spec.ts
- **Status**: done
- **Gate**: `bun run validate`
- **Acceptance**:
  - "A 2+ agent workflow has an enforced or test-covered worktree discipline rather than a best-effort recommendation only."
  - "Tests cover delegate threshold, blocked/all-claimed wait guidance, and the no-sync-before-final-close rule where applicable."
  - "bun run validate is green."

## acceptance

- The repo documents one canonical swarm workflow path with no conflicting wait/sync narratives.
- Runtime guidance and tests align with that path for delegate threshold, all-claimed waits and worktree discipline.
- `bun run validate` is green.
