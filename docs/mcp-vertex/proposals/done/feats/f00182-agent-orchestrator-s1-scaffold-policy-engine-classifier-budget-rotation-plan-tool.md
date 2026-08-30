---
id: f00182
title: "agent-orchestrator S1 — scaffold + policy engine + classifier + budget + rotation + plan tool"
kind: feat
status: done
type: proposal
track: agent-orchestrator
date: 2026-08-26
date_iso: 2026-08-26
mode: general
parent-plan: q00007
author: mcp-vertex-orchestrator (MiniMax M3, agent mode)
---
# f00182 — `agent-orchestrator` S1

## Goal

Land the foundational slice of the `agent-orchestrator` plugin:

- Plugin scaffold (`package.json`, `plugin.manifest.ts`,
  `tsconfig.json`, `vitest.config.ts`).
- Domain types: `IOrchestratorPolicy`, `IBudgetPolicy`,
  `IRotationPolicy`, `OrchestrationMode`, `ITask`, `IPlanStep`,
  `IModePlan`.
- OCP-friendly `ModeRegistry` + four adapters (`single`, `linear`,
  `swarm`, `auto`).
- Pure `TaskClassifier` (heuristic).
- Pure `BudgetTracker` (token accounting, exhausted checks).
- Pure `LoopDetector` for the four rotation triggers.
- Single MCP tool `<namespace>_plan` with `inputSchema` + `outputSchema`.
- Public surface via `src/public/index.ts` re-exports.
- Tests: 9 spec files, **56 tests passing**.

## Why

q00007 splits the plugin into S1..S5 + test + i18n. S1 is the
foundation: types + registry + planner + the read-only `plan` tool.
Without it, S2..S5 have no contract to dispatch against.

## Acceptance

- `bun run typecheck` (in `plugins/agent-orchestrator/`) ⇒ green.
- `bun run test` ⇒ **9 files, 56 tests** all green.
- `bun run build plugins/agent-orchestrator` ⇒ emits
  `dist/{index.js,index.d.ts,public/index.js,public/index.d.ts}`.

## Files added

```
plugins/agent-orchestrator/
├── package.json
├── plugin.manifest.ts
├── tsconfig.json
├── vitest.config.ts
├── src/
│   ├── index.ts                        # definePlugin wiring
│   ├── public/index.ts                 # public re-exports
│   └── lib/
│       ├── classifier/task-classifier.ts
│       ├── budget/budget-tracker.ts
│       ├── rotation/loop-detector.ts
│       ├── policy/types.ts             # IOrchestratorPolicy + zod
│       ├── policy/registry.ts          # IModeAdapter + ModeRegistry
│       ├── policy/policy.ts            # OrchestratorEngine façade
│       ├── policy/modes/single-mode.ts
│       ├── policy/modes/linear-mode.ts
│       ├── policy/modes/swarm-mode.ts
│       ├── policy/modes/auto-mode.ts
│       └── tools/plan.tool.ts
└── tests/src/lib/
    ├── classifier/task-classifier.spec.ts
    ├── budget/budget-tracker.spec.ts
    ├── rotation/loop-detector.spec.ts
    └── policy/
        ├── registry.spec.ts
        ├── single-mode.spec.ts
        ├── linear-mode.spec.ts
        ├── swarm-mode.spec.ts
        ├── auto-mode.spec.ts
        └── policy.spec.ts
```

## Tests breakdown

| File | Tests | Focus |
| --- | --- | --- |
| `policy/registry.spec.ts` | 5 | duplicate / unknown / insert-order / typeof |
| `policy/single-mode.spec.ts` | 7 | accepts / plan shape / verify-step budget gate |
| `policy/linear-mode.spec.ts` | 8 | accepts / plan shape / step invariants |
| `policy/swarm-mode.spec.ts` | 4 | accepts / plan shape / join + verify |
| `policy/auto-mode.spec.ts` | 4 | classifies + delegates to inner mode |
| `policy/policy.spec.ts` | 5 | engine façade + `assertPolicyValid` |
| `classifier/task-classifier.spec.ts` | 7 | every branch of the heuristic |
| `budget/budget-tracker.spec.ts` | 7 | accumulator + exhausted + reset |
| `rotation/loop-detector.spec.ts` | 6 | every rotation trigger + isolation |
| **total** | **56** | |

## Out of scope (deferred)

- Dispatch tools, swarm fan-out, auto telemetry — see q00007 S2..S5.
- Dogfooding this repo with `defaultMode: "auto"` — S5.
- i18n — S6.

## Definition of done

- [x] Plugin scaffold compiles + tests + builds.
- [x] No `process.cwd` / no sync I/O in hot paths.
- [x] All tools carry `outputSchema`.
- [x] Tests cover every public branch.
- [x] Conventional commit (`feat(agent-orchestrator): S1 scaffold + policy engine`).
