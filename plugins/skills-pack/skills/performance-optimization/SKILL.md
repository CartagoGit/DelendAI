---
name: mcp-vertex-performance-optimization
id: mcp-vertex-performance-optimization
title: Performance optimization
category: development
tags: ['performance', 'optimization', 'profiling', 'bundling', 'token-budget']
tools: ['mcp-vertex_perf_perf_bench', 'mcp-vertex_perf_perf_bundle', 'mcp-vertex_perf_perf_profile', 'mcp-vertex_quality_get_quality_scopes', 'mcp-vertex_quality_run_quality', 'mcp-vertex_quality_quality_run_all']
appliesTo: ['@mcp-vertex/skills-pack', '@mcp-vertex/perf', '@mcp-vertex/quality', '@mcp-vertex/core']
description: Find and fix regressions with benchmark, bundle, profile, and focused quality gates before widening the optimization scope. The discipline is measure, target, re-measure — never optimize without a before/after number.
---

# Performance optimization

The single most common performance mistake is optimizing the wrong thing.
The discipline below makes that mistake expensive instead of free.

## Goal

Reduce a measured cost (wall time, CPU, memory, tokens, disk, network)
by identifying the actual hot spot, applying the smallest possible
change, and re-measuring to confirm the win. Never trade correctness or
readability for a guessed speedup.

## Steps

1. **Define the cost** — State what you are measuring, the current
   value, the budget, and the user-visible symptom. If the cost is
   "tokens shipped to every agent", also state the audience — bytes
   are more expensive in cold-start payloads.
2. **Profile** — Use the gated tool that matches the cost:
   `mcp-vertex_perf_perf_bench` for micro-benchmarks,
   `mcp-vertex_perf_perf_bundle` for bundle size,
   `mcp-vertex_perf_perf_profile` for CPU hot spots,
   `mcp-vertex_quality_get_quality_scopes` for the available quality
   gates. Top-down before bottom-up: per-call cost vs total cost.
3. **Hypothesize (state the change before making it)** — Before
   editing, answer: what, why, worst case, how you will measure. If
   you cannot, you do not have an optimization — you have a guess.
4. **Change (smallest possible diff)** — One variable at a time. Do
   not bundle "while I am here" cleanups. Preserve the public
   contract. A faster wrong answer is not a win.
5. **Re-measure** — The metric from step 1 must improve (or stay
   flat, with a clear reason). `mcp-vertex_quality_run_quality` /
   `mcp-vertex_quality_quality_run_all` must still be green. If the
   win is smaller than the noise floor, revert.
6. **Document the win** — Update the proposal `## acceptance` if the
   budget changed. Update the budget test so future regressions are
   caught at the gate, not in production.

## Anti-patterns to refuse

- "Cache it" without measuring cache miss rate.
- "Make it async" without measuring the actual concurrency model.
- "Add an index" without measuring the write-amplification cost.
- "Use a faster language/library" without proving the bottleneck is
  in the language/library, not in the algorithm.
- "Tighten the loop" without proving the loop is on the hot path.

## Token budgets (special case)

Cold-start payload size is the single most expensive thing in an agent
session. The discipline is identical — measure, target, re-measure —
but the audience is **every** agent invocation. Treat any byte added
to the overview / tools-list / skill manifest as a permanent tax and
only add it for a clearly-justified capability.

## Exit criteria

- The before/after measurement is recorded in the proposal or PR
  description.
- `mcp-vertex_quality_run_quality` is green on the affected scopes.
- No neighbouring test, lint rule, or type check regressed.
- The change is one variable — no bundled drive-by refactor.
