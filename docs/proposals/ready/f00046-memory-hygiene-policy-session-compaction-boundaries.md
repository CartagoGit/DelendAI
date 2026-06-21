---
id: f00046
status: ready
type: proposal
track: plugins/memory+skills+docs+workflow
date: 2026-06-21
---

# f00046 — Memory hygiene policy + session compaction boundaries

## Goal

Close the memory/context gaps surfaced by a00027 S3: define what deserves durable memory, what should remain session-only, when to prefer memory vs docs/search/reread, and where session compaction or invalidation should be automated instead of relying only on operator discipline.

## Slices

- global_gate: type

### S1 — Normative memory policy
- files: docs/scaffolds/ARCHITECTURE-MEMORY.md
- files: docs/scaffolds/ARCHITECTURE-WORKFLOWS.md
- files: .github/copilot-instructions.md
- files: CLAUDE.md
- files: skills/mcp-vertex-operator/SKILL.md
- gate: lint
- acceptance:
  - "The repo defines a short policy for what deserves durable memory, what is session continuity only, and what should never be persisted."
  - "The policy includes a simple decision tree: memory vs docs/search vs local reread."
  - "The policy does not duplicate existing prompt guidance unnecessarily."
- status: pending

### S2 — Memory plugin and skill surfaces reflect the policy
- files: plugins/memory/src/lib/tools.ts
- files: plugins/memory/src/lib/store.ts
- files: skills/token-budget-playbook/SKILL.md
- files: skills/proposal-swarm-runner/SKILL.md
- depends_on: [S1]
- gate: type
- acceptance:
  - "memory_save/list/recall surfaces align with the documented non-log policy and make bounded durable-note usage explicit."
  - "Skill guidance on compact-first and memory usage is consistent with the new memory policy."
  - "Any operator-facing guidance about compaction or persistence has one canonical wording."
- status: pending

### S3 — Session compaction and invalidation hooks
- files: plugins/proposals/src/lib/swarm/continuity-policy.ts
- files: plugins/proposals/src/lib/swarm/round-context-sources.ts
- files: plugins/memory/tests/src/lib/tools.spec.ts
- files: plugins/proposals/tests/src/lib/swarm/continuity-policy.spec.ts
- depends_on: [S2]
- gate: type
- acceptance:
  - "The repo defines or implements a clearer trigger for when stale session context should be compacted or invalidated."
  - "At least one runtime or test-covered path demonstrates compaction/invalidation beyond purely manual /compact discipline."
  - "bun run validate is green."
- status: pending
