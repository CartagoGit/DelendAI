---
id: x01081
title: "The full agent catalog fits its byte limit"
kind: fix
status: review
type: proposal
track: core
date: 2026-11-16
last-transition-id: e1ff4aab-23ee-4d78-b483-4f954acc0276
last-correlation-id: e1ff4aab-23ee-4d78-b483-4f954acc0276
last-transition-from: in-progress
last-transition-at: 2026-11-16T09:18:27.255Z
---

# x01081 — The full agent catalog fits its byte limit

## goal

The full response of delendai_agent_catalog is over its own 10,500 B limit; bring it to 10,000 B or less by removing duplicated fields without dropping entries or ids.

## why

An external audit measured the `full` response of `delendai_agent_catalog` over its 10,500 B hard ceiling: 11,061 B in the token-budget fixture (core only, 32 tools, 10 skills). The gate had not caught it because `token-budget.e2e.spec.ts` measured the 34 B text summary instead of the structured payload the model receives.

## why this design

Decisions (nothing is left undecided):

- Tool `plugin` in `full`: dropped when it equals `server.namespacePrefix`, the rule `compact` already applies. The same fact was written once in `server` and once per core tool. Plugin tools keep theirs.
- Skill `bodyPath` in `full`: dropped. `delendai_skill` already lists it and loads the body by id, so the catalog only repeated it. `version`, `minCoreVersion`, `summary`, `appliesTo`, `tags` and every id stay.
- `compact`, `section` and `query` calls in `compact` mode, the `outputSchema` and the ceilings are unchanged. No entry is dropped and no summary is shortened.
- The token-budget catalog test now measures the structured payload, so the ceiling is a real check.

Measured: 11,061 B before (tools 6,536, skills 4,145), 9,704 B after (tools 5,896, skills 3,428).

## non-goals

- Raising the ceiling or touching the `compact` mode.
- Shortening tool or skill summaries.

## slices

- global_gate: none

### S1 — The full catalog drops the repeated plugin and skill body path
- **Status**: review
- **Files**: `packages/core/src/lib/catalog/agent-discovery-catalog.ts`, `packages/core/src/lib/catalog/agent-discovery-types.ts`, `packages/client/src/lib/services/agent-catalog-service.ts`, `packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts`, `packages/core/tests/src/lib/e2e/agent-catalog.e2e.spec.ts`, `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`, `packages/client/tests/services/agent-catalog-sections.spec.ts`, `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: none
- acceptance:
  - "`bunx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts -t 'agent catalog stays'` passes with the full payload at 9,704 B against the 10,500 B ceiling."
  - "`bunx vitest run packages/core/tests/src/lib/catalog/agent-discovery-catalog.spec.ts` proves the core tool plugin and the skill body path are absent in `full` while every tool name and skill id remains."
- shipped-in: `a5fa31d9890e`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- The full catalog is at most 10,000 B in the token-budget fixture, measured 9,704 B.
- `bun run lint:architecture` and `bun run proposal-hygiene` exit 0.
