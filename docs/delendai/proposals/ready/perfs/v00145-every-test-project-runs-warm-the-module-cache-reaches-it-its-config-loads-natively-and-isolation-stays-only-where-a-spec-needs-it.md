---
id: v00145
title: "Every test project runs warm: the module cache reaches it, its config loads natively, and isolation stays only where a spec needs it"
kind: perf
status: ready
type: proposal
track: ci
date: 2026-10-29
---

# v00145 — Every test project runs warm: the module cache reaches it, its config loads natively, and isolation stays only where a spec needs it

## goal

A test run spends its time running tests: modules are transformed once and kept, each project's config loads without being bundled first, and a project runs without per-file isolation unless one of its specs depends on it.

## why

The owner asked on 2026-10-29 whether TypeScript 7 or another runner would be faster. Measured that day: the typecheck already runs on TypeScript 7.0.2, the native compiler (19 s); a move to `bun test` was ruled out because the published comparisons agree it breaks `workspace:*` resolution and complex `vi.mock` use, both everywhere here. What is slow is Vitest's own setup, and three causes showed in the numbers:

- `fsModuleCache: true`, set at the root by v00138, reached no project: each project's config defines its own `test` block and inherits nothing from the root one. Vitest said so after every run ("transforming modules took 25.95s · 73% of tracked time, re-done on every run") and the CI cache step persisted a directory no project wrote.
- Every config imported `vitest.shared` without its extension (three also used `__dirname`), so Vite bundled each of the 80 configs before loading it instead of loading it natively.
- `vitest doctor` on orchestrator-runner: baseline (forks, isolate) 21.24 s, `pool: 'threads'` 17.83 s (−16%), `isolate: false` 13.00 s (−39%), with 4 workers 12.27 s (−42%); the suite passed twice in shuffled order without isolation. proposals measured 2.3 times faster without it (v00138), where module state leaked between files (v00139).

## non-goals

- Changing test runner.
- Dropping isolation for a project with a spec that needs it.

## slices

- global_gate: type

### S1 — The module cache and native config loading reach every project
- **Status**: pending
- **Files**: `apps/shared/vitest.config.ts`, `apps/web/vitest.config.ts`, `docs/delendai/examples/custom-plugin/vitest.config.ts`, `extensions/vscode/vitest.config.ts`, `packages/cli/vitest.config.ts`, `packages/client/vitest.config.ts`, `packages/context-compiler/vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/proposals-sqlite/vitest.config.ts`, `packages/roadmap-sqlite/vitest.config.ts`, `packages/sqlite/vitest.config.ts`, `packages/state-sqlite/vitest.config.ts`, `packages/state-telemetry/vitest.config.ts`, `packages/state/vitest.config.ts`, `packages/test-kit/vitest.config.ts`, `packages/ui-extension/vitest.config.ts`, `plugins/adaptive-optimizer/vitest.config.ts`, `plugins/agent-orchestrator/vitest.config.ts`, `plugins/api/vitest.config.ts`, `plugins/audit-orchestrator/vitest.config.ts`, `plugins/audit/vitest.config.ts`, `plugins/auto-agent-selector/vitest.config.ts`, `plugins/auto-plugin-selector/vitest.config.ts`, `plugins/browser/vitest.config.ts`, `plugins/cache/vitest.config.ts`, `plugins/changelog/vitest.config.ts`, `plugins/commit-policy/vitest.config.ts`, `plugins/completion/vitest.config.ts`, `plugins/container/vitest.config.ts`, `plugins/context-for-change/vitest.config.ts`, `plugins/conventions/vitest.config.ts`, `plugins/database/vitest.config.ts`, `plugins/deps/vitest.config.ts`, `plugins/diagram/vitest.config.ts`, `plugins/docs/vitest.config.ts`, `plugins/env/vitest.config.ts`, `plugins/error-reporting/vitest.config.ts`, `plugins/execution-env/vitest.config.ts`, `plugins/external-mcps/vitest.config.ts`, `plugins/forge/vitest.config.ts`, `plugins/framework-knowledge/vitest.config.ts`, `plugins/git/vitest.config.ts`, `plugins/github/vitest.config.ts`, `plugins/gitlab/vitest.config.ts`, `plugins/i18n/vitest.config.ts`, `plugins/impact-analysis/vitest.config.ts`, `plugins/issues-triage/vitest.config.ts`, `plugins/issues/vitest.config.ts`, `plugins/link-check/vitest.config.ts`, `plugins/logs/vitest.config.ts`, `plugins/memory/vitest.config.ts`, `plugins/notification/vitest.config.ts`, `plugins/observability/vitest.config.ts`, `plugins/orchestrator-runner/vitest.config.ts`, `plugins/perf/vitest.config.ts`, `plugins/project-health/vitest.config.ts`, `plugins/project-kpis/vitest.config.ts`, `plugins/prompt-eval/vitest.config.ts`, `plugins/prompts-pack/vitest.config.ts`, `plugins/proposals/vitest.config.ts`, `plugins/quality-policy/vitest.config.ts`, `plugins/quality/vitest.config.ts`, `plugins/refactor/vitest.config.ts`, `plugins/remote-provider-core/vitest.config.ts`, `plugins/roadmap/vitest.config.ts`, `plugins/rules/vitest.config.ts`, `plugins/search/vitest.config.ts`, `plugins/security/vitest.config.ts`, `plugins/self-learning/vitest.config.ts`, `plugins/skills-pack/vitest.config.ts`, `plugins/status-marker/vitest.config.ts`, `plugins/style-convention/vitest.config.ts`, `plugins/tech-debt/vitest.config.ts`, `plugins/test-convention/vitest.config.ts`, `plugins/test-policy/vitest.config.ts`, `plugins/usage-tracking/vitest.config.ts`, `plugins/web-fetch/vitest.config.ts`, `tests/e2e/vitest.config.ts`, `tools/vitest.config.ts`, `vitest.config.ts`, `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "Every project config spreads `sharedTestOptions` (`fsModuleCache: true`) and imports `vitest.shared.ts` with its extension, with no `__dirname`, so Vite loads it natively; orchestrator-runner's warm run took 18.4 s against 22.3 s cold."

### S2 — Isolation only where a spec needs it
- **Status**: pending
- **Files**: `vitest.shared.ts`, `plugins/proposals/vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/cli/vitest.config.ts`, `plugins/roadmap/vitest.config.ts`
- **Gate**: type
- acceptance:
  - "Each project is run without isolation in shuffled order; the projects whose specs pass that way run with `isolate: false`, the others keep isolation and are named, with the failing spec, in `vitest.shared.ts`; the full suite's time before and after is recorded (2026-10-29: 66 of 70 projects pass without isolation, 691 s isolated against 608 s; core, cli, proposals and roadmap keep it for 8 specs, which are the larger prize: proposals 685 s against 348 s, core 145 s against 93 s)."

## acceptance

- Every project config spreads `sharedTestOptions` (`fsModuleCache: true`) and imports `vitest.shared.ts` with its extension, with no `__dirname`, so Vite loads it natively; orchestrator-runner's warm run took 18.4 s against 22.3 s cold.
- Each project is run without isolation in shuffled order; the projects whose specs pass that way run with `isolate: false`, the others keep isolation and are named, with the failing spec, in `vitest.shared.ts`; the full suite's time before and after is recorded (2026-10-29: 66 of 70 projects pass without isolation, 691 s isolated against 608 s; core, cli, proposals and roadmap keep it for 8 specs, which are the larger prize: proposals 685 s against 348 s, core 145 s against 93 s).
