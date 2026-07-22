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
  short — re-route **up** a tier and retry, all inside the spend guard; and
- `auto_status` to report which providers are available, which are missing
  (with a one-command install hint), and how the roster was calibrated.

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
- An **escalation planner** that inverts the fallback direction: on an
  acceptance-gate *quality* failure (not just an availability error) it
  re-routes to the next tier **up**, bounded by `maxDepth` + spend guard.
- A **calibration store** in `pluginCacheDir` that reads `usage-tracking`
  outcomes into per-`(provider, capability)` win-rates and blends them into
  the scorer's currently-empty `strengths`.
- Two prompt-facing tools — `auto_run` (discover → route → run → gate →
  escalate) and `auto_status` (roster + calibration + install hints).

## slices

### S1 — unified zero-config provider discovery (CLI + API-key + guidance)

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/discovery/`, `plugins/auto-agent-selector/src/lib/tools/auto-status.tool.ts`
- **Gate**: bun run validate

Aggregate the existing CLI PATH probe with a new environment API-key probe
into one `IDiscoveredRoster` (available providers with strategy `cli|api`,
plus a `missing` list carrying a one-command install/auth hint). Pure over
an injected env + probe runner. `auto_status` surfaces it. This is the
foundation the router picks from and the first proof of "add it → it sees
everything," and it unblocks the Gemini/OpenAI/Anthropic API providers.

### S2 — quality-based up-escalation

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/escalate/`, `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`
- **Gate**: bun run validate

Add an escalation planner: run the cheapest capable provider, evaluate the
result against the project's acceptance gate (reuse the `quality` /
validation-matrix seam), and on failure re-route to the next tier **up**
(the inverse of `fallback.ts`'s `tier-down`), bounded by `maxDepth` and the
spend guard. `auto_run` composes discover → advise_routing → invoke → gate →
escalate. Pure planner, injected runner — fully unit-tested without spawning.

### S3 — empirical calibration from recorded outcomes

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/lib/calibrate/`
- **Gate**: bun run validate

Read `usage-tracking` outcome rows into a per-`(provider, capability)`
win-rate table persisted in `pluginCacheDir`, and blend it into the scorer's
empty `strengths` so routing improves from the project's own history. Falls
back to the hand-declared tags when there is not enough data. Deterministic
and explainable (no ML); the blend weight is a documented constant.

### S4 — auto-config on first use (the "add it and it just works" guarantee)

- **Status**: pending
- **Files**: `plugins/auto-agent-selector/src/index.ts`, `plugins/auto-agent-selector/src/lib/tools/auto-run.tool.ts`
- **Gate**: bun run validate

`register()` stays pure; the first tool call auto-discovers + persists the
roster and picks sensible defaults with no user config. When a needed CLI is
absent, the tool returns the exact install command (and can run it on
explicit `install: true` consent) rather than failing. An
`external-install`-style smoke proves a fresh workspace that adds only this
plugin can `auto_run` a trivial task end-to-end.

### S5 — docs, wiki page, catalog + adopter surface

- **Status**: pending
- **Files**: `docs/mcp-vertex/wiki/`, `docs/mcp-vertex/host-hints/`, `plugins/auto-agent-selector/README.md`
- **Gate**: bun run validate

Wiki page, README, host-hints, and catalog registration so the plugin is
discoverable and `mcpv init` can offer it. Confirms `catalog:check`,
`verify:tools`, and the site page render pass for the new plugin.

## acceptance

- `bun run validate` → exit 0 (all ~40 gates, including `verify:tools`,
  `catalog:check`, `types-in-contracts`, `lint:proposals`).
- `mcpv --plugins=auto-agent-selector __serve` boots and `overview` lists the
  plugin with `auto_run` + `auto_status`.
- With no config and at least one provider present (CLI or API key),
  `auto_run { task }` completes end-to-end; with a forced gate failure it
  escalates up a tier within the spend guard.
- Adding the plugin to a fresh workspace requires zero manual config — proven
  by an external-install-style smoke.

## notes

Prior art surveyed (user-requested competitive scan): RouteLLM (LMSYS),
Martian, Not-Diamond, LiteLLM Router, OpenRouter, Aider tiers — all route
hosted APIs; this plugin's novelty is routing the user's installed agent
CLIs + APIs, project-aware, escalating on the project's own acceptance gates.
Reuses the `dependsOn` two-phase load gate hardened in a00065 S6.
