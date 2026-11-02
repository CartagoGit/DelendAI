---
id: f00798
title: "an agent finds the skill for what it is doing without carrying any skill it is not using"
kind: feat
status: review
type: proposal
track: tokens
date: 2026-11-01
last-transition-id: 0faad3a1-8f2e-4568-9a69-b58249f82a10
last-correlation-id: 0faad3a1-8f2e-4568-9a69-b58249f82a10
last-transition-from: in-progress
last-transition-at: 2026-11-01T18:32:29.639Z
---

# f00798 — an agent finds the skill for what it is doing without carrying any skill it is not using

## goal

A tool search names the one skill that explains the tool and how to load it, every skill says which tools it explains in a short line, so the catalogue stays small and a skill is read only when it is about to be used.

## why

Measured 2026-11-01: across six recorded sessions no delendai skill was invoked, and `delendai_skill` has no call in 7,960, while `tool_search` has 601. Bodies were already lazy, so the problem was reaching them. Only 11 of 23 skills named their tools, the index took the alphabetically first skill (`quality_run_all` pointed at `delendai-migrate-from-x`), the core review and close tools pointed at nothing, and `delendai_skill` is hidden with nothing saying how to load one. Descriptions stay in a host's prompt on every turn and reached 390 bytes each.

## non-goals

- Adding tools to the always-visible surface: the hint names the loader that is already there.
- Removing the compatibility pointer skill, which manifests and translations still name.
- Splitting AGENT-BOOTSTRAP.md, the largest fixed cost, which is its own change.

## slices

- global_gate: type

### S1 — A tool search names the right skill and how to load it
- **Status**: review
- **Files**: `docs/delendai/TOKEN-BUDGETS.md`, `packages/core/src/generated/tool-outputs.ts`, `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`, `packages/core/src/lib/skills/tool-skill-index.ts`, `packages/core/src/lib/tools/tool-surface.tool.ts`, `packages/core/tests/src/lib/skills/skill-metadata-budget.spec.ts`, `packages/core/tests/src/lib/skills/tool-skill-index.spec.ts`, `packages/core/tests/src/lib/tools/tool-surface.tool.spec.ts`, `plugins/audit/skills/audit-runner/SKILL.md`, `plugins/audit/skills/delendai-audit-playbook/SKILL.md`, `plugins/commit-policy/skills/read-stderr-storm/SKILL.md`, `plugins/external-mcps/skills/external-mcps/SKILL.md`, `plugins/proposals/skills/concurrency-patterns/SKILL.md`, `plugins/proposals/skills/legacy-proposal-migration/SKILL.md`, `plugins/proposals/skills/multi-agent-coordination/SKILL.md`, `plugins/proposals/skills/proposals-workflow-playbook/SKILL.md`, `plugins/proposals/skills/state-repair-playbook/SKILL.md`, `plugins/quality/skills/quality-and-rules-gates/SKILL.md`, `plugins/rules/skills/delendai-rules-dogma-priority/SKILL.md`, `plugins/rules/skills/rules-solid-architecture/SKILL.md`, `plugins/status-marker/skills/status-marker-and-closure/SKILL.md`, `tools/scripts/lint/skill-coverage.baseline.json`
- **Gate**: type
- acceptance:
  - "A tool's catalogue entry points at the skill its own plugin leads before a cross-cutting one."
  - "A tool search that names a skill says how to load it, and one that names none carries no hint."
  - "Every plugin skill but the compatibility pointer and those of a plugin outside the preset names its tools, in a description of at most 200 bytes; a spec holds both."
- shipped-in: `aebe3b62edfa`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- A tool's catalogue entry points at the skill its own plugin leads before a cross-cutting one.
- A tool search that names a skill says how to load it, and one that names none carries no hint.
- Every plugin skill but the compatibility pointer and those of a plugin outside the preset names its tools, in a description of at most 200 bytes; a spec holds both.
