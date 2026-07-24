---
id: f00119
kind: feat
title: auto-agent-selector — zero-config multi-agent routing that picks the right LLM per task
status: ready
date: 2026-07-22
track: plugin+orchestration+routing
---

# f00119 — auto-agent-selector

## goal

Ship a plugin that, the moment it is added, **auto-discovers every LLM /
agent the user can reach** (CLI on PATH *and* API keys in the environment),
**routes each task to the most convenient one** for the job, and
**escalates to a stronger model only when the cheap one fails the project's
own acceptance gate** — with **zero manual configuration**. The user adds
the plugin and drives everything from prompts; they never hand-edit a
roster, a key map, or a cost table.

Concretely, `mcpv --plugins=auto-agent-selector` (or adding it to
`mcp-vertex.config.json`) must be enough for:

- `auto_run { task: "…" }` to pick the cheapest capable provider, run it,
  check the result against the project's acceptance gate, and — if it fell
  short — re-route **up** a tier and retry, all inside the spend guard;
- `auto_recommend { taskType | task }` to **recommend** (never dictate) the
  best provider per kind of work, with a transparent rationale (cost,
  capability fit, measured win-rate) so the user can decide and **pin** a
  choice; and
- `auto_status` to report which providers are available, which are missing
  (with a one-command install hint), and how the roster was calibrated.

**The user is always in control.** Cost is a first-class, user-controlled
factor: each provider carries a cost model and the user sets a budget /
cost preference (from "cheapest that works" to "always the strongest,
cost no object"). The app **recommends with reasons; the user decides** and
may pin a specific provider per task type. Because pricing shifts and better
models keep appearing, the roster is **re-evaluated over time** — including
newly-added API keys — optionally consulting the internet for current
pricing/benchmarks, and the recommendation is surfaced in **both the CLI and
the VS Code extension**.

## why

The user asked for "un plugin que enrute según el tipo de agentes de los que
disponga el usuario … utilizar el más conveniente para cada tipo de
trabajo … subir el nivel del agente o el coste según la tarea … si el
agente fácil no consigue completar la tarea, escalar." Most of the routing
*brain* already exists in `orchestrator-runner` (see `## architecture`);
what is missing is (a) API-key providers in the roster, (b) **up**-escalation
gated on quality, (c) learning which provider actually wins each task type,
and (d) the zero-config "add it and it works" wrapper. This is the active
"LLM router / model gateway" product category (RouteLLM, Martian,
Not-Diamond, LiteLLM Router, OpenRouter, Aider's weak/strong tiers) — but
those route *hosted APIs only*. mcp-vertex's differentiator, delivered here,
is routing across the user's **installed agent CLIs + APIs**, **project-aware**,
escalating on the **project's own acceptance gates** — which none of them do.

## why this design

A **new plugin that `dependsOn: ['orchestrator-runner']`** and *composes* its
tools is cleaner than either a parallel re-implementation (duplicating the
scorer, spend guard, quota, healthcheck) or bloating orchestrator-runner
with a second concern. The routing brain (`scoreProvider`, `advise_routing`,
`invoke`, `fallback`) stays the single source of truth; auto-agent-selector
is a thin, prompt-facing orchestration layer that adds only the four gaps.
The `dependsOn` gate (a00065 S6) guarantees the selector never half-registers
when orchestrator-runner is absent.

Zero-config means **self-configuring on first use**, not register-time side
effects: `register()` stays pure (no subprocess, no install), and the roster
is discovered + persisted to `pluginCacheDir` the first time a tool runs.
Installing a missing CLI is **offered** (a tool returns/executes the install
command with explicit consent), never done silently.

## non-goals

- **No re-implementation of the routing brain.** `scoreProvider`,
  `advise_routing`, `invoke`, `fallback`, the spend guard, quota and
  healthcheck are reused from orchestrator-runner, never copied.
- **No hosted service or proxy.** Routing is local and headless; the plugin
  never becomes a network gateway.
- **No trained ML router.** Calibration uses recorded task outcomes +
  transparent heuristics, not a bundled model — it must stay explainable.
- **No silent installs or key exfiltration.** A missing CLI is installed
  only on explicit consent; API keys are read from the environment and
  never written to a store or logged.
- **Never dictates.** The plugin recommends with reasons; a user pin always
  wins, and the user can veto/override any automatic choice. Cost preference
  ranges from "cheapest that works" to "always strongest" — the app never
  forces one end.
- **No stale price/quality assumptions baked in.** Cost and capability
  numbers are data (config + calibration + optional live lookup), refreshable
  as models and prices change — never hardcoded constants the user can't move.

## architecture

Reused from `orchestrator-runner` (no change to its public contract):

- `router/score.ts::scoreProvider` — capability-hint × strengths/weaknesses,
  `MODE_TIER { plan:4, review:3, implement:2, explore:1 }`, cost preference.
- `advise_routing` tool — winner + backups + scoring trace.
- `invoke` + `invoke/fallback.ts` + `invoke/spend-guard.ts` + quota/limits —
  execution with a bounded fallback chain and spend caps.
- `bootstrap.ts::discoverProviders` — PATH probe for `claude, codex,
  copilot, aider, cn, agent` + `install-hints`.

Added by `auto-agent-selector` (new plugin, `dependsOn: ['orchestrator-runner']`):

- A **discovery aggregator** that unions the CLI probe with an **API-key
  probe** (`GEMINI_API_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, …) into
  one roster with per-provider availability + install/auth guidance.
- A **cost model + preference layer**: each provider carries a cost estimate
  (per-token or tier); the user sets a budget / cost preference and may
  **pin** a provider per task type in `mcp-vertex.config.json`. A pin always
  wins over the score; absent a pin, the score decides. Recommendations are
  advisory — the runner never overrides a user pin.
- An **escalation planner** that inverts the fallback direction: on an
  acceptance-gate *quality* failure (not just an availability error) it
  re-routes to the next tier **up**, bounded by the user's cost ceiling,
  `maxDepth` + spend guard.
- A **calibration + evaluation store** in `pluginCacheDir` that reads
  `usage-tracking` outcomes into per-`(provider, capability)` win-rates,
  blends them into the scorer's empty `strengths`, and **evaluates
  newly-added providers** — optionally consulting the internet (via the
  `web-fetch` plugin, allow-listed) for current pricing/benchmarks so a
  new/cheaper/better model can be recommended as it appears.
- Prompt-facing tools — `auto_run` (discover → route → run → gate →
  escalate), `auto_recommend` (rank + rationale per task type, user
  decides/pins), and `auto_status` (roster + costs + calibration + install
  hints). The recommendation is surfaced in the **CLI** and a **VS Code
  extension panel**.

## Slices

### S1 — unified zero-config provider discovery (CLI + API-key + guidance)

- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/discovery/`, `plugins/auto-agent-selector/src/lib/tools/auto-status.tool.ts`
- **Gate**: bun run validate

Aggregate the existing CLI PATH probe with a new environment API-key probe
into one `IDiscoveredRoster` (available providers with strategy `cli|api`,
plus a `missing` list carrying a one-command install/auth hint). Pure over
an injected env + probe runner. `auto_status` surfaces it. This is the
foundation the router picks from and the first proof of "add it → it sees
everything," and it unblocks the Gemini/OpenAI/Anthropic API providers.

### S2 — cost model + user preferences (recommend, never dictate)

- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/prefs/`, `plugins/auto-agent-selector/src/lib/tools/auto-recommend.tool.ts`
- **Gate**: bun run validate

Give each provider a cost estimate (per-token or tier) and let the user set a
budget / cost preference plus **per-task-type pins** in
`mcp-vertex.config.json`. `auto_recommend` ranks the roster for a task type
and returns each option with a transparent rationale (cost, capability fit,
measured win-rate) — the user decides and may pin. A pin always overrides the
score; the runner never contradicts it. Pure ranking over the roster +
prefs; fully unit-tested.

### S3 — quality-based up-escalation (within the user's cost ceiling)

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/escalate/`, `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`
- **Gate**: bun run validate

Add an escalation planner: run the cheapest capable provider, evaluate the
result against the project's acceptance gate (reuse the `quality` /
validation-matrix seam), and on failure re-route to the next tier **up**
(the inverse of `fallback.ts`'s `tier-down`), bounded by the user's cost
ceiling, `maxDepth` and the spend guard. `auto_run` composes discover →
recommend/route → invoke → gate → escalate, honouring pins. Pure planner,
injected runner — fully unit-tested without spawning.

### S4 — empirical calibration + new-model evaluation (optional internet-informed)

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/calibrate/`, `plugins/auto-agent-selector/src/lib/tools/auto-evaluate.tool.ts`
- **Gate**: bun run validate

Read `usage-tracking` outcome rows into a per-`(provider, capability)`
win-rate table persisted in `pluginCacheDir`, blend it into the scorer's
empty `strengths`, and **evaluate newly-added providers** as they appear (a
new API key, a new model). `auto_evaluate` can optionally consult the
internet for current pricing/benchmarks via the `web-fetch` plugin
(allow-listed, opt-in) so cost/quality stay current as the market changes.
Deterministic + explainable (no bundled ML); falls back to hand-declared
tags when data is thin; blend weight is a documented constant.

### S5 — auto-config on first use (the "add it and it just works" guarantee)

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/index.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`
- **Gate**: bun run validate

`register()` stays pure; the first tool call auto-discovers + persists the
roster and picks sensible defaults with no user config. When a needed CLI is
absent, the tool returns the exact install command (and can run it on
explicit `install: true` consent) rather than failing. An
`external-install`-style smoke proves a fresh workspace that adds only this
plugin can `auto_run` a trivial task end-to-end.

### S6 — recommendation surface (CLI + extension) + docs, wiki, catalog

- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/`, `packages/ui-extension/src/`, `docs/mcp-vertex/wiki/`, `plugins/auto-agent-selector/README.md`
- **Gate**: bun run validate

Surface `auto_recommend`/`auto_status` in both the **CLI** (a command that
prints the per-task-type recommendation table + rationale) and a **VS Code
extension panel** (the user reviews and pins from the UI). Wiki page, README,
host-hints, and catalog registration so the plugin is discoverable and
`mcpv init` can offer it. Confirms `catalog:check`, `verify:tools`, and the
site page render pass for the new plugin.

## acceptance

- `bun run validate` → exit 0 (all ~40 gates, including `verify:tools`,
  `catalog:check`, `types-in-contracts`, `lint:proposals`).
- `mcpv --plugins=auto-agent-selector __serve` boots and `overview` lists the
  plugin with `auto_run`, `auto_recommend`, `auto_evaluate` + `auto_status`.
- With no config and at least one provider present (CLI or API key),
  `auto_run { task }` completes end-to-end; with a forced gate failure it
  escalates up a tier within the spend guard **and** within the user's cost
  ceiling.
- `auto_recommend` returns ranked options with a cost/capability/win-rate
  rationale; a user pin (config) overrides the score and is never contradicted.
- `auto_evaluate` folds a newly-added provider into the roster and (opt-in)
  refreshes cost/quality from an allow-listed online source.
- Adding the plugin to a fresh workspace requires zero manual config — proven
  by an external-install-style smoke.

## notes

Prior art surveyed (user-requested competitive scan): RouteLLM (LMSYS),
Martian, Not-Diamond, LiteLLM Router, OpenRouter, Aider tiers — all route
hosted APIs; this plugin's novelty is routing the user's installed agent
CLIs + APIs, project-aware, escalating on the project's own acceptance gates.
Reuses the `dependsOn` two-phase load gate hardened in a00065 S6.
