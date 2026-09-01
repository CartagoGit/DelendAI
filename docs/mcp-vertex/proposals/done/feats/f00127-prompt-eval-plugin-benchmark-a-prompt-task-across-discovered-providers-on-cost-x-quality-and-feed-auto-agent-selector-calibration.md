---
id: f00127
kind: feat
title: prompt-eval plugin — benchmark a prompt/task across discovered providers on cost x quality and feed auto-agent-selector calibration
status: done
date: 2026-07-23
track: plugin+eval+routing
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 5 commits referencing f00127 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 5-commit batch
shipped-in:
  - 4f75ec49 # fix(proposals): prune stale f00127/f00129 duplicates from ready+in-progress
  - 559b8cf8 # fix(f00127): align calibration sample threshold
  - bb9add92 # feat(f00127): S3 calibration write-through + prompt-eval wiring
  - e6533f9e # fix(preset-catalog): align source with expected test counts for f00128 S1 (datab
  - c1067568 # feat(f00127): S3 calibration write-through + plugin README
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

- **Status**: done
- **Files**: `plugins/prompt-eval/src/lib/eval/`, `plugins/prompt-eval/src/lib/tools/eval-run.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `eval-harness.ts` exports `runEvalHarness(input, deps)`, a pure
    planner over an injected `IEvalHarnessDeps` triplet:
    `allowSpend` (spend guard), `runProvider` (exec), and
    `checkAcceptance` (project gate). A denied spend guard is a recorded
    skip (`skipped: 'spend-denied'`), never a provider invocation.
  - `eval-run.tool.ts` registers `eval_run` with `effects: ['network',
    'spawn']` and a strict zod input requiring `consent: true` — spend
    is opt-in. Returns `{ attempts, passed, totalCostUsd, winner }`:
    `winner` is the cheapest passing provider (or `null` when none
    passed).
  - 2 unit tests cover: cheapest-passing wins; spend-denied providers
    are never invoked.
  - committed: `80cd369e feat(prompt-eval): add spend-guarded eval
    harness`.

### S2 — scoring + report

- **Status**: done
- **Files**: `plugins/prompt-eval/src/lib/score/`, `plugins/prompt-eval/src/lib/tools/eval-report.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `lib/score/score.ts`:
      - `scoreProvider(providerId, attempts)` → `IProviderScore`
        (attempts, passes, winRate, totalCostUsd, compositeScore).
        Skipped attempts don't count toward `attempts` but their `costUsd`
        aggregates. Pure.
      - `scoreReport(attempts)` → `IRankedReport` (rows, winner, worst,
        totalCostUsd, totalPasses). Sort: compositeScore desc, then cost
        asc, then tier asc. `winner` is the cheapest passing provider
        — matches `eval_run`'s `winner` exactly so the two surfaces
        never disagree.
      - `scorePerTaskType(items)` → `Record<TaskType, IRankedReport>`
        for per-taskType dashboards (calibration write-through target).
      - `compositeScore = winRate * 100 - totalCostUsd`. Bounded in
        [0, 100] on the win-rate side, unbounded on the cost side — a
        cheap perfect run beats an expensive perfect run.
  - `lib/tools/eval-report.tool.ts`:
      - `eval_report` tool with `tags: ['evaluation', 'routing']` (no
        `effects: ['spawn']`: pure, no I/O). Strict zod input (1+
        attempts). Empty list → structured `toolError` envelope.
      - Output schema: `IRankedReport` + a Markdown table for the CLI
        (`| Provider | Tier | Att | Pass | Win-rate | Cost | Score |`).
      - Registered in `src/index.ts` alongside `eval_run`; public
        barrel re-exports `scoreProvider`, `scoreReport`,
        `scorePerTaskType`, `IProviderScore`, `IRankedReport`,
        `IAttemptWithTask`, `TaskType`.
  - 16 tests pass (4 score+tool + 12 score unit).

### S3 — calibration write-through

- **Status**: done
- **Files**: `plugins/prompt-eval/src/lib/calibrate/`, `plugins/prompt-eval/README.md`
- **Gate**: bun run validate
- implementation:
  - `lib/calibrate/write-through.ts` maps non-skipped `IEvalAttempt`s into
    `auto-agent-selector`'s append-only `IOutcomeRecord` log and resolves the
    exact shared store location under `.cache/mcp-vertex/results/auto-agent-selector`.
  - `eval_calibrate` persists those records via the same JSONL store S4 reads,
    then returns the public `{ providerId, winRate, samples }` summary computed
    from that store. No parallel benchmark DB is introduced.
  - `README.md` documents the three-tool flow (`eval_run` -> `eval_report` ->
    `eval_calibrate`) and the write-through contract.
  - 6 S3 tests cover file-format compatibility, S4 summary shape, round-trip
    integrity, skipped-attempt filtering, tool behavior, and plugin registration
    exposing the new calibration tool.

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
