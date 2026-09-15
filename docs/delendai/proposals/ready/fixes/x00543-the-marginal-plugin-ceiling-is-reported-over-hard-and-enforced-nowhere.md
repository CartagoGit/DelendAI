---
id: x00543
title: "The marginal plugin ceiling is reported over hard and enforced nowhere"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-09-15
tags:
    - tokens
    - budgets
    - gates
    - test-fidelity
---

# x00543 — The marginal plugin ceiling is reported over hard and enforced nowhere

## goal

When one plugin exceeds its preset's `marginalPluginHard`, a gate goes red.
The dashboard's "over hard" and the gate's exit code must never disagree.

## why

Checked on develop on 2026-09-15, following an external audit:

- `docs/delendai/TOKEN-BUDGETS.md` reports `standard`'s marginal status as
  `over hard (11,000B)`. The owner is `agent-orchestrator`, at 11,167 B
  of static `tools/list`. Its output schemas account for 7,427 B of that,
  and `delendai_agent-orchestrator_dispatch` alone for 3,378 B.
- `tools/scripts/test/run-actual-preset-budget.script.ts` (`tokens:gate`)
  declares `marginalPluginHard` and `marginalPluginWarning` in its budget
  type. It compares the total `tools/list`, compact overview and round
  context against their ceilings. The marginal ceiling is never compared,
  so it never sets `breached`.
- `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts` asserts the
  marginal ceiling for all six governed presets. Every one of those cases
  connects with `dynamicSurfaceCapabilities`, and that negotiates the
  adaptive surface: 7 core tools and no plugin owners. `marginalPluginBytes`
  therefore returns `Math.max(0)`, and the assertion cannot fail.

That is a documented ceiling, a report that says it is breached, and two
gates that each look like they enforce it without doing so. It is the same
failure class as #235's schema test that never called `listTools()`: a
green harness measuring a different reality from the one it names.

## non-goals

- **No higher ceiling.** 11,000 B stays. Raising it to 11,167 B would turn
  this fix into the thing it is fixing.
- **No weaker contracts to save bytes.** `agent-orchestrator` shrinks by
  removing duplication and dead schema weight. Fields that callers read
  stay.

## slices

### S1 — `tokens:gate` enforces the marginal ceiling

- **Status**: done — before the S3 shrink, `bun run tokens:gate -- --preset=standard,swarm,lean` printed `largest plugin (agent-orchestrator): 11,167 B (warning 9,500 / hard 11,000) => HARD BREACH` and exited 1. The same gate over develop's code exited 0. `preset-marginal-ceiling.spec.ts` covers the boundary: 11,001 B breaches, exactly 11,000 B does not, core is never counted, and a core-only surface is `no-plugins`.
- **Files**: [`tools/scripts/test/run-actual-preset-budget.script.ts`, `tools/scripts/test/preset-marginal-ceiling.ts`, `tools/scripts/test/preset-marginal-ceiling.interface.ts`, `tools/scripts/test/preset-marginal-ceiling.spec.ts`]

This slice adds a pure function that takes the owner rows, excludes core,
takes the heaviest owner, and compares it against the preset's marginal
ceiling. The gate prints that owner next to its other surfaces and counts
a hard breach. On the adaptive surface there are no plugin owners, so
there is nothing to compare, and the gate says that rather than reporting
0 B as a pass.

- **Gate**: `npx vitest run tools/scripts/test/preset-marginal-ceiling.spec.ts`
- **Expect**: an owner at `hard + 1` B breaches, an owner at exactly
  `hard` B passes, and core is never counted.

### S2 — The e2e marginal cases measure the surface they name

- **Status**: done — with the swarm, lean and per-preset marginal cases pinned to `surfaceMode: 'native'`, and `marginalPluginBytes` refusing a surface with no plugin owners, the spec failed exactly once before S3: `standard marginal plugin bytes = 11167B: expected 11167 to be less than or equal to 11000`. The other 16 cases passed, on the same surface as before.
- **Files**: [`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`]

Each marginal case pins `surfaceMode: 'native'`. Each also asserts that at
least one plugin owner was measured, so a future change of surface cannot
empty the assertion again without failing.

- **Gate**: `npx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`

### S3 — `agent-orchestrator` fits under its preset ceilings

- **Status**: done, over the warning — the plugin measures 10,577 B on `standard` (was 11,167 B): under the 11,000 B hard ceiling and still over the 9,500 B warning. `_budget` is removed. It listed a second schema for figures `_dispatch` already returns, and it invented what it could not know: both token ceilings were always 0, and `exhausted` meant "spent more than nothing". Spend now comes back through `_plan_ref` as `spent`, next to the plan's real `budget` ceilings, and `SpendSchema`/`spendOf` are shared with `_dispatch`. The swarm cost pin moves 161,042 → 160,451 B and 149 → 148 tools. The agent-orchestrator suite passes: 306 tests in 29 files.
- **Files**: [`plugins/agent-orchestrator/src/lib/tools/dispatch.tool.ts`, `plugins/agent-orchestrator/src/lib/dispatch/linear-dispatcher.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/dispatch.tool.spec.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/dispatch-output-contract.spec.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/dispatch-port-refusal.spec.ts`, `plugins/agent-orchestrator/tests/src/index.spec.ts`, `packages/core/tests/src/lib/token/catalog-task-context-cost.spec.ts`, `docs/delendai/ADOPTER-SURFACE-MODE.md`]

Getting under the warning would need another 1,077 B. The largest
remaining weight is `_dispatch`'s decision receipt, about 1.9 KB of its
3,378 B output schema. Moving it behind a read-back changes what a
dispatch returns, so it is left to a decision rather than folded into
this fix.

- **Gate**: `bun run tokens:gate` exits 0 with every preset's largest
  plugin within hard, and `bun run tokens:dashboard:check` reports no
  `over hard` marginal row.

### S4 — The dashboard and the gate share one verdict

- **Status**: done — the dashboard's marginal column is now `marginalStatus(row.ownerRows, …)`, built on the same `marginalVerdict` the gate enforces, so a surface with no plugin tool reads `n/a` instead of `within hard`. Regenerated on 2026-09-15: `TOKEN-BUDGETS.md` has 0 `over hard` rows, and `standard` reads `over warning (9,500B)` at 10,577 B. `tokens:dashboard:check` passes, and `tokens:gate` exits 0 across all six governed presets.
- **Files**: [`tools/scripts/report/token-budget-dashboard.script.ts`, `tools/scripts/test/preset-marginal-ceiling.ts`]

The dashboard's marginal status comes from the same function S1 adds. An
"over hard" row and a zero exit can no longer coexist.

- **Gate**: `bun run tokens:dashboard:check && bun run tokens:gate`

## acceptance

- Adding 200 B of schema to any plugin that sits within 200 B of its
  ceiling turns `tokens:gate` red, and the failure names the plugin.
- No marginal ceiling is raised.

## notes

- Source: an external audit on 2026-09-15 (file
  `2026_09_15_Chatgpt_sol_5_6_23:09_migrate_develop_wip_work_model_12.md`,
  section 2). Each claim above was re-measured on develop before being
  written down.
