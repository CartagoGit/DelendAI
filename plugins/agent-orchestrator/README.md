# `@delendai/agent-orchestrator`

Workflow-policy plugin for `@delendai/core`. Decides **how** the
main agent works — task-by-task, sequential subagents, parallel swarm,
or auto-classified — with token budgets and mid-task subagent
rotation.

## Status

| Slice | Status | Contents |
| --- | --- | --- |
| **S1** | done | policy engine + classifier + budget + rotation + `plan` tool |
| S2 | pending | linear dispatch + rotation wiring |
| S3 | pending | swarm parallel dispatch + join |
| S4 | pending | auto telemetry + classifier regress |
| S5 | pending | dogfooding on `develop` |
| S6 | pending | i18n keys |

Track the proposal in `docs/mcp-vertex/proposals/in-progress/plans/q00007-plan-agent-orchestrator-plugin.md`.

## Install

Add to `mcp-vertex.config.json` plugin list:

```jsonc
{
  "plugins": {
    "agent-orchestrator": {
      "policy": {
        "defaultMode": "auto",                 // or "single" | "linear" | "swarm"
        "defaults": {
          "budget": {
            "maxTokensOrchestrator": 200_000,   // 0 = unlimited
            "maxTokensPerSubagent":   50_000,   // 0 = unlimited
            "timeoutMs": 0
          },
          "rotation": {
            "maxIterationsPerSubagent": 3,
            "allow": [
              "token-budget-exhausted",
              "schema-violation",
              "repeated-output",
              "error-storm"
            ]
          }
        }
      }
    }
  }
}
```

Or via the CLI preset:

```bash
mcp-vertex --plugins=agent-orchestrator
mcp-vertex --plugins=agent-orchestrator,auto-agent-selector
```

## Modes

| Mode | When it fits | Cost shape |
| --- | --- | --- |
| `single` | trivial/small tasks, ≤ ~280 chars | cheapest |
| `linear`  | medium tasks, refactor-style | scout → implementer → verify |
| `swarm`   | large tasks, root-level, audit-shaped | parallel slice A/B → join → verify |
| `auto`    | default; classifier routes per task | scales with verdict |

When the configured `defaultMode` declines a task (e.g. `single` is
configured but the task is tagged `refactor`), the engine falls back
to `auto` silently — you get a plan, not an error.

## Tool

| Tool | Description |
| --- | --- |
| `<namespace>_plan` | Plan a task against the configured policy. Returns mode, rationale, ordered steps, budgets, rotation policy. **Read-only.** |

The plugin never dispatches subagents itself in v1; S2 adds
`<namespace>_dispatch`. See q00007.

## Public surface

```ts
import {
  createOrchestratorEngine,
  ModeRegistry,
  SingleModeAdapter,
  LinearModeAdapter,
  SwarmModeAdapter,
  AutoModeAdapter,
  TaskClassifier,
  BudgetTracker,
  LoopDetector,
  DEFAULT_BUDGET_POLICY,
  DEFAULT_ROTATION_POLICY,
  OrchestratorPolicySchema,
  type IOrchestratorPolicy,
  type IModeAdapter,
} from "@delendai/agent-orchestrator/public";
```

## Tests

```bash
cd plugins/agent-orchestrator
bun run typecheck
bun run test          # 9 files, 56 tests
bun run build         # dist/ + dist/public/
```

## Conventions

- Solid: OCP-friendly `ModeRegistry`; modes are plug-and-play.
- Clean: each file owns one concern; pure functions where possible.
- Reusable: reuses `definePlugin` / `toolJson` / `toolError` /
  `TOKEN_BUDGETS` from `@delendai/core/public`.
- Dogfooded: this repo adopts the plugin in S5 with
  `defaultMode: "auto"`.
