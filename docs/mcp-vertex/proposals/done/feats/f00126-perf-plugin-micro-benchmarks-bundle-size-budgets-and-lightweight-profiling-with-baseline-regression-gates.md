---
id: f00126
kind: feat
title: perf plugin — micro-benchmarks, bundle-size budgets and lightweight profiling with baseline regression gates
status: done
date: 2026-07-23
track: plugin+perf+quality
shipped-in:
    - bfbdfd46 # feat(f00126): S1 bench harness + baseline compare
    - 85e15d32 # docs(f00126): mark S1 bench harness + baseline compare done
    - f0d55edf # feat(f00126): S2 bundle-size budget — perf_bundle tool + tests
    - 87b722e2 # docs(f00126): mark S2 bundle-size budget done — actual file paths
    - 3815c571 # feat(perf): S3 perf_profile tool + profile capture + tests
    - bbf3b945 # feat(f00126): S3 profiling capture + metrics-gate integration
    - e726bc22 # docs(f00126): reconcile S3 done — move proposal to done/feats
---

# f00126 — perf plugin

## goal

A `perf` plugin that measures and guards performance: micro-**benchmarks**
(tinybench/vitest bench), **bundle-size budgets** from build output, and
lightweight **profiling / hotspot** capture — reporting normalized results and
**regressions vs a committed baseline**, extending mcp-vertex's existing
metrics gate. Budgets auto-configure per stack via packs (r00011).

## why

Performance and bundle size are common concerns, and mcp-vertex already ships a
metrics gate plus a ~5-minute `validate` — perf visibility is a direct
dogfooding win (track tool latency and the `apps/web` bundle so regressions are
caught, not discovered).

## why this design

Compose r00012's runner; bench via the toolchain already present
(vitest bench / tinybench), bundle size from the build artifacts, profiling via
`node --prof` / `0x` when available (probed, opt-in). Results are normalized to
the shared result shape and compared against a **baseline file** — the same
baseline pattern the finding/dangling-refs gates already use, so pre-existing
numbers never block. Comparators are pure over injected measurements.

## non-goals

- No continuous profiling daemon and no bundled profiler binary.
- No perf claims without a baseline (avoids noise-as-signal).
- Not a replacement for the metrics gate — it feeds it.

## slices

### S1 — bench harness + baseline compare

- **Status**: done
- **Files**: `plugins/perf/src/lib/bench/`, `plugins/perf/src/lib/tools/perf-bench.tool.ts`
- **Gate**: bun run validate
- implementation:
  - `bench/bench-runner.ts` exposes `runBench(name, samples)` returning ops/s, meanMs, p95Ms.
  - `bench/bench-comparator.ts` exposes `compareToBaseline(baseline, current, threshold)` returning regressions.
  - `perf-bench.tool.ts` exposes `perf_bench` with `benches`, optional `baseline`, optional `threshold`.
  - Wired into the plugin registry; 11/11 plugin tests pass.

Run named benches, record ops/s, compare to `perf-baseline.json`, flag
regressions beyond a threshold. Pure comparator over injected samples.

### S2 — bundle-size budget

- **Status**: done
- **Files**: `plugins/perf/src/lib/perf/check-budgets.ts`, `plugins/perf/src/lib/perf/real-deps.ts`, `plugins/perf/src/lib/tools/perf-bundle.tool.ts`
- **Gate**: bun run validate

`perf_bundle` reads build output sizes, checks per-entry budgets (pack-tuned),
fails on a seeded bloat. Pure size analyzer over injected file stats.

### S3 — profiling capture + metrics-gate integration

- **Status**: done
- **Files**: `plugins/perf/src/lib/profile/`, `plugins/perf/README.md`
- **Gate**: bun run validate

`perf_profile` captures a hotspot report when a profiler is present (probed),
and the plugin's summaries feed the metrics gate. Catalog + `data`/`web-app`
pack tuning.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Benches a fixture and flags a seeded regression against the baseline.
- Bundle budget fails on seeded bloat and passes within budget.
- Missing profiler → graceful skip with a hint, never a crash.

## notes

Reuses r00012 and the existing metrics gate + baseline pattern. Prior art:
tinybench, size-limit, 0x, Bencher.
