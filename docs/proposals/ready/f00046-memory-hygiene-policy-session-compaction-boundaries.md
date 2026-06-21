---
id: f00046
kind: feat
title: Memory hygiene policy + session compaction boundaries
status: ready
type: proposal
track: plugins/memory+skills+docs+workflow
date: 2026-06-21
---

# f00046 — Memory hygiene policy + session compaction boundaries

## Goal

Close the memory/context gaps surfaced by a00027 S3: define what deserves durable memory, what should remain session-only, when to prefer memory vs docs/search/reread, and where session compaction or invalidation should be automated instead of relying only on operator discipline.

## why

- a00027 S3 showed that durable memory is already safe and bounded, but the policy for what should be persisted is still too implicit.
- Session compaction and context invalidation still rely more on guidance than on one clear contract.
- The cheapest correct next step is to align policy, plugin wording and at least one compaction/invalidation path before opening broader host work.

## non-goals

- Building a memory UI or expanding memory CRUD surface area.
- Replacing TTL/quota/redaction primitives already shipped in the memory plugin.
- Solving host-side compact-first defaults; that belongs to the budget/consumer follow-up.

## Slices

- global_gate: type

### S1 — Normative memory policy
- **Files**: docs/scaffolds/ARCHITECTURE-MEMORY.md, docs/scaffolds/ARCHITECTURE-WORKFLOWS.md, .github/copilot-instructions.md, CLAUDE.md, skills/mcp-vertex-operator/SKILL.md
- **Status**: done
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "The repo defines a short policy for what deserves durable memory, what is session continuity only, and what should never be persisted."
  - "The policy includes a simple decision tree: memory vs docs/search vs local reread."
  - "The policy does not duplicate existing prompt guidance unnecessarily."

### S2 — Memory plugin and skill surfaces reflect the policy
- **Files**: plugins/memory/src/lib/tools.ts, plugins/memory/src/lib/store.ts, skills/token-budget-playbook/SKILL.md, skills/proposal-swarm-runner/SKILL.md
- **Status**: pending
- **Gate**: `bun run typecheck`
- **Acceptance**:
  - "memory_save/list/recall surfaces align with the documented non-log policy and make bounded durable-note usage explicit."
  - "Skill guidance on compact-first and memory usage is consistent with the new memory policy."
  - "Any operator-facing guidance about compaction or persistence has one canonical wording."

### S3 — Session compaction and invalidation hooks
- **Files**: plugins/proposals/src/lib/swarm/continuity-policy.ts, plugins/proposals/src/lib/swarm/round-context-sources.ts, plugins/memory/tests/src/lib/tools.spec.ts, plugins/proposals/tests/src/lib/swarm/continuity-policy.spec.ts
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "The repo defines or implements a clearer trigger for when stale session context should be compacted or invalidated."
  - "At least one runtime or test-covered path demonstrates compaction/invalidation beyond purely manual /compact discipline."
  - "bun run validate is green."

## acceptance

- The repo defines a short, canonical policy for durable memory vs session-only continuity.
- Memory/docs/search/reread choice is documented as a simple decision tree.
- At least one compaction or invalidation path is clearer or more automatic than today's purely manual baseline.
- `bun run validate` is green.
