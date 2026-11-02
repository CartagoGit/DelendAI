---
id: v00145
title: "Every test project runs warm: the module cache reaches it and its config loads natively"
kind: perf
status: done
type: proposal
track: ci
date: 2026-10-29
last-transition-id: 60bd43de-e309-4362-9db6-102dfc3ec9a9
last-correlation-id: 60bd43de-e309-4362-9db6-102dfc3ec9a9
last-transition-from: review
last-transition-at: 2026-11-02T17:22:41.479Z
shipped-in:
  - "8f9a2ccf56207dead0f61d2884fe67c1e6f56815"
---

# v00145 — Every test project runs warm: the module cache reaches it and its config loads natively

## goal

A test run spends its time running tests: modules are transformed once and kept, and each project's config loads without being bundled first.

## why

The owner asked on 2026-10-29 whether TypeScript 7 or another runner would be faster. Measured that day: the typecheck already runs on TypeScript 7.0.2, the native compiler (19 s); a move to `bun test` was ruled out because the published comparisons agree it breaks `workspace:*` resolution and complex `vi.mock` use, both everywhere here. What is slow is Vitest's own setup, and three causes showed in the numbers:

- `fsModuleCache: true`, set at the root by v00138, reached no project: each project's config defines its own `test` block and inherits nothing from the root one. Vitest said so after every run ("transforming modules took 25.95s · 73% of tracked time, re-done on every run") and the CI cache step persisted a directory no project wrote.
- Every config imported `vitest.shared` without its extension (three also used `__dirname`), so Vite bundled each of the 80 configs before loading it instead of loading it natively.
- `vitest doctor` on orchestrator-runner: baseline (forks, isolate) 21.24 s, `pool: 'threads'` 17.83 s (−16%), `isolate: false` 13.00 s (−39%), with 4 workers 12.27 s (−42%); the suite passed twice in shuffled order without isolation. proposals measured 2.3 times faster without it (v00138), where module state leaked between files (v00139).

## non-goals

- Changing test runner.
- Dropping per-file isolation. Measured on 2026-10-29: 66 of 70 projects passed without it run alone (orchestrator-runner 21.24 s to 13.00 s), but a CI shard runs many projects in one process, and there state leaked between projects: the plugins 4/4 shard failed `issues` on the forge and `quality-policy` locally, a different project each run. Isolation stays until projects get worker pools of their own.

## slices

- global_gate: type

### S1 — The module cache and native config loading reach every project
- **Status**: done
- **Files**: `apps/shared/vitest.config.ts`, `apps/web/vitest.config.ts`, `docs/delendai/examples/custom-plugin/vitest.config.ts`, `extensions/vscode/vitest.config.ts`, `packages/cli/vitest.config.ts`, `packages/client/vitest.config.ts`, `packages/context-compiler/vitest.config.ts`, `packages/core/vitest.config.ts`, `packages/proposals-sqlite/vitest.config.ts`, `packages/sqlite/vitest.config.ts`, `packages/state-sqlite/vitest.config.ts`, `packages/state-telemetry/vitest.config.ts`, `packages/state/vitest.config.ts`, `packages/test-kit/vitest.config.ts`, `packages/ui-extension/vitest.config.ts`, `plugins/adaptive-optimizer/vitest.config.ts`, `plugins/agent-orchestrator/vitest.config.ts`, `plugins/api/vitest.config.ts`, `plugins/audit-orchestrator/vitest.config.ts`, `plugins/audit/vitest.config.ts`, `plugins/auto-agent-selector/vitest.config.ts`, `plugins/auto-plugin-selector/vitest.config.ts`, `plugins/browser/vitest.config.ts`, `plugins/cache/vitest.config.ts`, `plugins/changelog/vitest.config.ts`, `plugins/commit-policy/vitest.config.ts`, `plugins/completion/vitest.config.ts`, `plugins/container/vitest.config.ts`, `plugins/context-for-change/vitest.config.ts`, `plugins/conventions/vitest.config.ts`, `plugins/database/vitest.config.ts`, `plugins/deps/vitest.config.ts`, `plugins/diagram/vitest.config.ts`, `plugins/docs/vitest.config.ts`, `plugins/env/vitest.config.ts`, `plugins/error-reporting/vitest.config.ts`, `plugins/execution-env/vitest.config.ts`, `plugins/external-mcps/vitest.config.ts`, `plugins/forge/vitest.config.ts`, `plugins/framework-knowledge/vitest.config.ts`, `plugins/git/vitest.config.ts`, `plugins/github/vitest.config.ts`, `plugins/gitlab/vitest.config.ts`, `plugins/i18n/vitest.config.ts`, `plugins/impact-analysis/vitest.config.ts`, `plugins/issues-triage/vitest.config.ts`, `plugins/issues/vitest.config.ts`, `plugins/link-check/vitest.config.ts`, `plugins/logs/vitest.config.ts`, `plugins/memory/vitest.config.ts`, `plugins/notification/vitest.config.ts`, `plugins/observability/vitest.config.ts`, `plugins/orchestrator-runner/vitest.config.ts`, `plugins/perf/vitest.config.ts`, `plugins/project-health/vitest.config.ts`, `plugins/project-kpis/vitest.config.ts`, `plugins/prompt-eval/vitest.config.ts`, `plugins/prompts-pack/vitest.config.ts`, `plugins/proposals/vitest.config.ts`, `plugins/quality-policy/vitest.config.ts`, `plugins/quality/vitest.config.ts`, `plugins/refactor/vitest.config.ts`, `plugins/remote-provider-core/vitest.config.ts`, `plugins/roadmap/vitest.config.ts`, `plugins/rules/vitest.config.ts`, `plugins/search/vitest.config.ts`, `plugins/security/vitest.config.ts`, `plugins/self-learning/vitest.config.ts`, `plugins/skills-pack/vitest.config.ts`, `plugins/status-marker/vitest.config.ts`, `plugins/style-convention/vitest.config.ts`, `plugins/tech-debt/vitest.config.ts`, `plugins/test-convention/vitest.config.ts`, `plugins/test-policy/vitest.config.ts`, `plugins/usage-tracking/vitest.config.ts`, `plugins/web-fetch/vitest.config.ts`, `tests/e2e/vitest.config.ts`, `tools/vitest.config.ts`, `vitest.config.ts`, `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "Every project config spreads `sharedTestOptions` (`fsModuleCache: true`) and imports `vitest.shared.ts` with its extension, with no `__dirname`, so Vite loads it natively; orchestrator-runner's warm run took 18.4 s against 22.3 s cold."
- shipped-in: `b4deb1f33d1e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash
- review-log: approved by minimax-m3.1-flash — verified at 8f9a2ccf5620, validate exit 0 and tests 300/300 claimed, no recorded run cited; acceptance 1/1: (1) At commit 8f9a2ccf56207dead0f61d2884fe67c1e6f56815 vitest.shared.ts exports sharedTestOptions with fsModuleCache true, 79 of the 80 vitest configs spread it, e… — Approved on the delivered state of merge 8f9a2ccf56207dead0f61d2884fe67c1e6f56815 (PR #1567, claude-opus-5-5). The merge touches exactly the 79 project vitest configs, the root vitest.config.ts, vitest.shared.ts and this proposal document (82 files, 516 insertions, 78 deletions) and changes no isolation, pool or environment setting, so both non-goals hold: no runner change and no dropping per-file isolation. At the delivered commit vitest.shared.ts exports sharedTestOptions = { fsModuleCache: true }, 79 of the 80 configs spread it, every vitest.shared import carries the .ts extension and no config mentions __dirname; the root config is the only one not spreading the helper, because it sets fsModuleCache itself and imports vitest.shared.ts with its extension. The recorded timing was reproduced here: with node_modules/.vitest-cache removed the orchestrator-runner project passed 51 files and 300 tests in 14.74 s with transform at 63 percent, and the warm run took 12.12 s with transform at 52 percent, the same direction and the same roughly 18 percent gain as the recorded 22.3 s cold against 18.4 s warm. The slice gate passed with bun run typecheck exiting 0 in the review unit. Later commits touched these files (d024147c8, f760384f1, 02efbd523, d646d0c9a, 6a7cbf607, 4f0372008, 77f910e98 and 1eba86877, which removed packages/roadmap-sqlite and one config with it); the criterion still holds at the current head, where 78 of the 79 configs spread the helper with no __dirname and no extensionless import.

## acceptance

- Every project config spreads `sharedTestOptions` (`fsModuleCache: true`) and imports `vitest.shared.ts` with its extension, with no `__dirname`, so Vite loads it natively; orchestrator-runner's warm run took 18.4 s against 22.3 s cold.
