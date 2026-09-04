# 09 — Plugin `auto-agent-selector`

The user-facing routing layer that sits **on top of** `orchestrator-runner` and
makes routing **zero-config** — discover every reachable provider, recommend
the best value for a task, and plan a cheapest→strongest escalation ladder
within the user's cost ceiling.

> Wiki page for proposal **f00119**. This page documents the design; the
> slice-by-slice progress lives in
> [`docs/mcp-vertex/proposals/in-progress/f00119-auto-agent-selector-plugin.md`](../proposals/in-progress/f00119-auto-agent-selector-plugin.md).

---

## Why this name

The user (2026-07-22): *"un plugin que enrute según el tipo de agentes de los
que disponga el usuario … utilizar el más conveniente para cada tipo de
trabajo … subir el nivel del agente o el coste según la tarea"*.

- **`orchestrator-runner`** owns the routing brain (`scoreProvider`,
  `advise_routing`, `invoke`, `fallback`, spend guard, quota, healthcheck).
- **`auto-agent-selector`** is the prompt-facing orchestration layer that
  adds the four pieces `orchestrator-runner` deliberately does not own:
  **API-key provider discovery**, **cost model + user preferences**, **quality
  up-escalation**, and **empirical calibration from `usage-tracking`**.
- **`selector`** (not "router") because the plugin **recommends with reasons
  and lets the user pin**; it never dictates. A user pin always wins over
  the score.

The plugin slug becomes `mcp-vertex-auto-agent-selector` for npm and
`@delendai/auto-agent-selector` for the workspace. Namespace prefix at
runtime: `auto-agent-selector_` (e.g. `mcp-vertex_auto-agent-selector_auto_run`).

---

## What it owns (and what it doesn't)

| Responsibility | Owner | Why |
|---|---|---|
| Per-provider capability scoring, fallback chain | `orchestrator-runner` | already battle-tested |
| Subprocess invocation + spend guard | `orchestrator-runner` | the runner is the executor |
| Acceptance-gate definition (validation matrix) | `quality` plugin | the project defines what "done" means |
| **CLI + API-key provider discovery** | `auto-agent-selector` | unified roster; one place to ask "who is reachable?" |
| **Cost model + user preferences + per-task pins** | `auto-agent-selector` | user-controlled budget, never bypassed |
| **Quality up-escalation (the inverse of `tier-down`)** | `auto-agent-selector` | re-route on a gate failure, within cost ceiling |
| **Empirical calibration from `usage-tracking` outcomes** | `auto-agent-selector` | fold real win-rates into the empty `strengths` |

It depends on `orchestrator-runner` at runtime via the `dependsOn` two-phase
load gate (hardened in `a00065` S6).

---

## Tools

| Tool | Purpose |
|---|---|
| `mcp-vertex_auto-agent-selector_auto_status` | Roster: which providers are reachable (CLI on PATH or API key in env), cheapest-first, with install/auth hint for any that are missing. |
| `mcp-vertex_auto-agent-selector_auto_recommend` | Rank the roster for a `(taskType | task)` and return each option with a transparent rationale (cost, capability fit, measured win-rate). The user decides; a pin always wins. |
| `mcp-vertex_auto-agent-selector_auto_run` | Plan the cheapest→strongest escalation ladder for `task`; honour `costCeiling`, `maxDepth`, `pin`. Optionally `install:true` to run a one-shot install command (consent-gated, argv-only). |
| `mcp-vertex_auto-agent-selector_auto_evaluate` | Read `usage-tracking` outcomes, fold a newly-added provider into the roster, optionally refresh cost/quality from an allow-listed online source (opt-in via `web-fetch`). |
| `mcp-vertex_auto-agent-selector_auto_record` | Record a per-task outcome for a provider so future recommendations get sharper. |

`auto_run` is a **planner**: it returns the ladder and `howToExecute` and
expects the host to run each rung (via `orchestrator-runner`'s `invoke` or
the provider's CLI/API directly) and the project's acceptance gate between
rungs. The plugin never executes on its own and never spends the user's
money without explicit consent.

---

## How the cost↔quality dial works

The user sets `costQualityTradeoff: 0..10` (default 7) —

- **0** = always the strongest model (cost no object)
- **10** = always the cheapest model that can plausibly do the task

The score is `capability_fit × (1 + tradeoff) - cost_tier × tradeoff`. A
user-supplied `pin` (config or per-call) overrides the score; the runner
never contradicts a pin. The cost ceiling (`costCeiling: 1..5`) bounds how
high the escalation ladder is allowed to climb; `maxDepth` bounds how many
rungs.

---

## CLI surface

| Command | What it does |
|---|---|
| `mcpv agents status` | Same as `auto_status` — show the roster. |
| `mcpv agents recommend --dial=7 --pin=claude` | Same as `auto_recommend`. |
| `mcpv agents run --task="…" --ceiling=3 --max-depth=3` | Same as `auto_run`. |
| `mcpv agents record --provider=claude --success=true --task=review` | Record an outcome for calibration. |

The CLI is the **canonical human surface** for the plugin: a user who has
no MCP client can still see the recommendation, plan the route, and record
outcomes from a terminal.

---

## VS Code extension surface

The extension exposes an **`Auto-agent selector`** command (registered as
`mcp-vertex.openAutoAgentSelector`) that opens a panel with:

- the roster (reachable / missing + install hint)
- the per-task recommendation for the current task type
- a **Pin** action to write a per-task pin into `mcp-vertex.config.json`

Pin writes go through the existing config-center write command so they
respect the project's command policy and the user's consent flow.

---

## Cross-references

- Routing brain: [`07-plugin-orchestrator-runner.md`](07-plugin-orchestrator-runner.md)
- Outcomes source: [`08-usage-tracking-plugin.md`](08-usage-tracking-plugin.md)
- Acceptance gate: [`docs/mcp-vertex/VALIDATION-MATRIX.md`](../VALIDATION-MATRIX.md)
  (the validation matrix is the gate `auto_run` checks against between rungs)
- Competitive scan: [`external/litellm.md`](external/litellm.md),
  [`external/openrouter.md`](external/openrouter.md) — both route hosted APIs
  only; this plugin's novelty is routing the user's installed agent CLIs + APIs,
  project-aware, escalating on the project's own acceptance gates.

---

## Status

Slices shipped (S1–S4): unified discovery (CLI + API-key), cost model + user
preferences, quality up-escalation (pure planner with injected seams),
empirical calibration from `usage-tracking`. CLI commands, README and
catalog registration are live. Slice S5 (end-to-end smoke in a fresh
workspace) and S6 (wiki + VS Code extension panel) are tracked in the
proposal document.
