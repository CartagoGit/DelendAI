---
name: performance-optimization
id: performance-optimization
title: Performance optimization
category: dev
tags: ['performance', 'benchmarking', 'profiling', 'quality']
tools: ['mcp-vertex_perf_perf_bench', 'mcp-vertex_perf_perf_bundle', 'mcp-vertex_perf_perf_profile', 'mcp-vertex_quality_get_quality_scopes', 'mcp-vertex_quality_run_quality', 'mcp-vertex_quality_quality_run_all']
appliesTo: ['@delendai/skills-pack', '@delendai/perf', '@delendai/quality']
description: Identify and fix performance regressions by measuring first, profiling the hot path second, and only then widening to broader quality gates.
---

# Performance optimization

## Goal

Remove a performance regression with measurements that can falsify the current
hypothesis, instead of optimizing code that only looks suspicious.

## When to use

Use this when runtime latency, throughput, or bundle size regresses and you
need a disciplined loop from baseline to fix verification.

## Steps

1. Capture a reproducible baseline with `mcp-vertex_perf_perf_bench` so you can
   compare before and after numbers on the same workload.
2. If the regression is build-output or delivery related, run
   `mcp-vertex_perf_perf_bundle` to locate oversized artifacts before changing
   runtime code.
3. Profile the suspected path with `mcp-vertex_perf_perf_profile` and treat the
   biggest hotspot as the default first target.
4. Decide whether the problem is algorithmic, I/O bound, or build related
   before editing anything.
5. Ask `mcp-vertex_quality_get_quality_scopes` which focused validation scopes
   exist for this workspace.
6. Use `mcp-vertex_quality_run_quality` on the narrowest relevant scope after
   the first change to make sure the optimization did not break the slice.
7. Finish with `mcp-vertex_quality_quality_run_all` only after the targeted
   check is green and the regression is actually improved.

## Checks

- The benchmark baseline was captured before the first edit.
- The profile points at the edited path, not at a neighboring guess.
- Bundle work is driven by bundle evidence, not by runtime intuition.
- The post-change benchmark improves the same metric that regressed.

## Exit criteria

- The chosen metric is measurably better than baseline.
- The targeted quality scope and the aggregated quality run both pass.
- The optimization scope stayed local; no broad clean-up was mixed into the fix.

## References

- `mcp-vertex_perf_perf_bench`
- `mcp-vertex_perf_perf_bundle`
- `mcp-vertex_perf_perf_profile`
- `mcp-vertex_quality_get_quality_scopes`
- `mcp-vertex_quality_run_quality`
- `mcp-vertex_quality_quality_run_all`
