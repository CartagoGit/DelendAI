---
id: f00127
kind: feat
title: prompt-eval plugin — benchmark a prompt/task across discovered providers on cost x quality and feed auto-agent-selector calibration
status: ready
date: 2026-07-23
track: plugin+eval+routing
---

# f00127 — prompt-eval plugin

## goal

A `prompt-eval` plugin that evaluates a prompt (or a task type) **across the
providers `auto-agent-selector` discovered**, scoring **cost × quality**
against the project's own acceptance checks, and **writing the results into
`auto-agent-selector`'s calibration store** (its S4 win-rate table). This is
the empirical "run tests that decide which model is actually best for *this*
project" layer on top of the router.

## why

It closes the loop on the routing work just shipped: the router recommends and
escalates, but the *evidence* for which provider wins each task type has to
come from measured runs. Nothing on the market benchmarks across a user's
**installed agent CLIs + APIs**, project-aware, gated on the project's own
acceptance matrix — that is exactly mcp-vertex's differentiator. Dogfooding:
choose the cheapest model that actually passes this repo's gates, with data.

## why this design

`dependsOn: ['auto-agent-selector', 'orchestrator-runner']` and compose them:
pure scoring over the same injected `runProvider` + `checkAcceptance` seams as
`runWithEscalation`, so evaluation is deterministic and testable without
spawning. Results persist to `pluginCacheDir` in the exact shape S4 reads, so
calibration is a **write-through**, not a parallel store. Datasets are project
tasks/fixtures, not a bundled benchmark.

## non-goals

- No bundled judge/eval model — acceptance is the project's real gate.
- No spend without the spend guard + explicit consent.
- No hosted leaderboard or telemetry upload.

## slices

### S1 — eval harness

- **Status**: pending
- **Files**: `plugins/prompt-eval/src/lib/eval/`, `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts`
- **Gate**: bun run validate

`eval_run` executes a prompt across the ranked roster, runs the acceptance gate
per provider, and records cost + pass/fail. Pure over injected run+gate seams;
spend-guarded.

### S2 — scoring + report

- **Status**: pending
- **Files**: `plugins/prompt-eval/src/lib/score/`, `plugins/prompt-eval/src/lib/tools/eval-report.tool.ts`
- **Gate**: bun run validate

`eval_report` computes cost×quality + win-rate per (provider, task type) and
surfaces a ranked table (CLI + extension). Pure scorer; fully unit-tested.

### S3 — calibration write-through

- **Status**: pending
- **Files**: `plugins/prompt-eval/src/lib/calibrate/`, `plugins/prompt-eval/README.md`
- **Gate**: bun run validate

Persist win-rates to `auto-agent-selector`'s calibration store so its ranking
blends measured evidence (its S4). Catalog + wiki; membership in a routing pack.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- `eval_run` evaluates a sample task across ≥2 discovered providers and
  produces a ranked cost/quality report.
- The written win-rates are consumed by `auto-agent-selector` ranking (its S4).
- All runs respect the spend guard; nothing runs without a reachable provider.

## notes

Reuses `auto-agent-selector` discovery/ranking + `orchestrator-runner`
invoke/spend-guard. Prior art: RouteLLM eval, LMSYS Arena, promptfoo — but
project-gated and across installed CLIs + APIs. Direct synergy with f00119 S4.
