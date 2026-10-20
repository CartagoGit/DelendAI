# Audit inventory — snapshot `514758e783620c8953079be4d71fceccacb3de8b`

Auditor: `gpt-6-luna`  
Phase: A, independent; inventory and source review in progress. No other auditors' conclusions have been consulted.  
All counts below are from Git-tracked paths in the assigned snapshot. Test-file counts are inventory only, not executed-test counts.

## Top-level component families

| ID | Path | Function | Dependencies | Declared state | Verified state | Tests | Risks | Evidence | Auditor |
|---|---|---|---|---|---|---|---|---|---|
| PKG | `packages/*` (13 packages) | Shared runtime, contracts, clients, state, persistence, UI, CLI and test support | Per-package manifests not yet reviewed | Pending | Pending, except focused core paths in `CORE-REVIEW.md` | Full suite passed in Phase 0; per-package mapping pending | Cross-package API boundaries, state consistency | Snapshot Git tree and Phase 0 checkpoint | gpt-6-luna |
| PLG | `plugins/*` (61 plugin directories) | Opt-in MCP capabilities | Per-plugin manifests not yet reviewed | Pending | Not reviewed; every plugin pending individually | Per-plugin `*.spec.ts` / `*.test.ts` counts below; not a behavior verdict | Contracts, side effects, state, security, token cost | Snapshot Git tree; each entry below | gpt-6-luna |
| EXT | `extensions/*` (1 extension) | Host-specific VS Code adapter | Pending | Pending | Pending | Pending | Activation, webview bridge, host state | Snapshot Git tree | gpt-6-luna |
| APP | `apps/*` (2 packages: `shared`, `web`) | Shared app code and public web product | Pending | Pending | Pending | Pending | i18n, data freshness, accessibility, generated docs | Snapshot Git tree | gpt-6-luna |
| TOOL | `tools/*` (top-level dirs: `docs-api`, `scripts`, `tests`) | Build, repo automation, test/tooling infrastructure | Pending | Pending | Pending | Pending | Unsafe scripts, duplicated logic, CI gaps | Snapshot Git tree | gpt-6-luna |
| DOC | `docs/delendai/**` | Product, architecture, agent, proposal and adoption documentation | Pending | Pending | Pending | N/A | Stale claims and active plans inconsistent with code | Snapshot Git tree; documentation phase pending | gpt-6-luna |
| CI | `.github/**`, root config and hooks | Quality, CI, release and policy gates | Pending | Pending | Pending | Workflow inventory pending | Missing or bypassable gates, release mismatch | Snapshot Git tree | gpt-6-luna |

## Per-plugin inventory

At this checkpoint the function, dependencies, manifest claims, contracts, tool surface, risks, and evidence remain **unreviewed** for every row. `plugin.manifest.ts` is present in all 61 directories. Test counts mean tracked spec/test source files only. Replace the pending fields only after reading that plugin's entry point, engines, tool schemas, tests, skills and state-writing paths.

| ID | Path | Function | Dependencies | Declared state | Verified state | Tests | Risks | Evidence | Auditor |
|---|---|---|---|---|---|---:|---|---|---|
| PLG-001 | `plugins/adaptive-optimizer` | Pending manifest review | Pending | Pending | Pending | 5 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-002 | `plugins/agent-orchestrator` | Pending manifest review | Pending | Pending | Pending | 35 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-003 | `plugins/api` | Pending manifest review | Pending | Pending | Pending | 9 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-004 | `plugins/audit` | Pending manifest review | Pending | Pending | Pending | 14 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-005 | `plugins/audit-orchestrator` | Pending manifest review | Pending | Pending | Pending | 4 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-006 | `plugins/auto-agent-selector` | Pending manifest review | Pending | Pending | Pending | 18 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-007 | `plugins/auto-plugin-selector` | Pending manifest review | Pending | Pending | Pending | 9 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-008 | `plugins/browser` | Pending manifest review | Pending | Pending | Pending | 6 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-009 | `plugins/cache` | Pending manifest review | Pending | Pending | Pending | 1 file | Pending review | Manifest path exists | gpt-6-luna |
| PLG-010 | `plugins/changelog` | Pending manifest review | Pending | Pending | Pending | 4 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-011 | `plugins/commit-policy` | Pending manifest review | Pending | Pending | Pending | 78 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-012 | `plugins/completion` | Pending manifest review | Pending | Pending | Pending | 3 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-013 | `plugins/container` | Pending manifest review | Pending | Pending | Pending | 19 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-014 | `plugins/context-for-change` | Pending manifest review | Pending | Pending | Pending | 2 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-015 | `plugins/conventions` | Pending manifest review | Pending | Pending | Pending | 12 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-016 | `plugins/database` | Pending manifest review | Pending | Pending | Pending | 7 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-017 | `plugins/deps` | Pending manifest review | Pending | Pending | Pending | 9 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-018 | `plugins/diagram` | Pending manifest review | Pending | Pending | Pending | 5 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-019 | `plugins/docs` | Pending manifest review | Pending | Pending | Pending | 6 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-020 | `plugins/env` | Pending manifest review | Pending | Pending | Pending | 9 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-021 | `plugins/error-reporting` | Pending manifest review | Pending | Pending | Pending | 25 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-022 | `plugins/execution-env` | Pending manifest review | Pending | Pending | Pending | 13 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-023 | `plugins/external-mcps` | Pending manifest review | Pending | Pending | Pending | 22 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-024 | `plugins/forge` | Pending manifest review | Pending | Pending | Pending | 28 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-025 | `plugins/framework-knowledge` | Pending manifest review | Pending | Pending | Pending | 9 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-026 | `plugins/git` | Pending manifest review | Pending | Pending | Pending | 13 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-027 | `plugins/github` | Pending manifest review | Pending | Pending | Pending | 7 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-028 | `plugins/gitlab` | Pending manifest review | Pending | Pending | Pending | 8 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-029 | `plugins/i18n` | Pending manifest review | Pending | Pending | Pending | 5 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-030 | `plugins/impact-analysis` | Pending manifest review | Pending | Pending | Pending | 2 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-031 | `plugins/issues` | Pending manifest review | Pending | Pending | Pending | 21 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-032 | `plugins/issues-triage` | Pending manifest review | Pending | Pending | Pending | 6 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-033 | `plugins/link-check` | Pending manifest review | Pending | Pending | Pending | 1 file | Pending review | Manifest path exists | gpt-6-luna |
| PLG-034 | `plugins/logs` | Pending manifest review | Pending | Pending | Pending | 10 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-035 | `plugins/memory` | Pending manifest review | Pending | Pending | Pending | 17 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-036 | `plugins/notification` | Pending manifest review | Pending | Pending | Pending | 4 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-037 | `plugins/observability` | Pending manifest review | Pending | Pending | Pending | 14 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-038 | `plugins/orchestrator-runner` | Pending manifest review | Pending | Pending | Pending | 38 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-039 | `plugins/perf` | Pending manifest review | Pending | Pending | Pending | 8 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-040 | `plugins/project-health` | Pending manifest review | Pending | Pending | Pending | 2 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-041 | `plugins/project-kpis` | Pending manifest review | Pending | Pending | Pending | 7 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-042 | `plugins/prompt-eval` | Pending manifest review | Pending | Pending | Pending | 6 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-043 | `plugins/prompts-pack` | Pending manifest review | Pending | Pending | Pending | 1 file | Pending review | Manifest path exists | gpt-6-luna |
| PLG-044 | `plugins/proposals` | Pending manifest review | Pending | Pending | Pending | 293 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-045 | `plugins/quality` | Pending manifest review | Pending | Pending | Pending | 11 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-046 | `plugins/quality-policy` | Pending manifest review | Pending | Pending | Pending | 5 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-047 | `plugins/refactor` | Pending manifest review | Pending | Pending | Pending | 8 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-048 | `plugins/remote-provider-core` | Pending manifest review | Pending | Pending | Pending | 6 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-049 | `plugins/roadmap` | Pending manifest review | Pending | Pending | Pending | 27 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-050 | `plugins/rules` | Pending manifest review | Pending | Pending | Pending | 15 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-051 | `plugins/search` | Pending manifest review | Pending | Pending | Pending | 18 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-052 | `plugins/security` | Pending manifest review | Pending | Pending | Pending | 14 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-053 | `plugins/self-learning` | Pending manifest review | Pending | Pending | Pending | 5 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-054 | `plugins/skills-pack` | Pending manifest review | Pending | Pending | Pending | 1 file | Pending review | Manifest path exists | gpt-6-luna |
| PLG-055 | `plugins/status-marker` | Pending manifest review | Pending | Pending | Pending | 3 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-056 | `plugins/style-convention` | Pending manifest review | Pending | Pending | Pending | 4 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-057 | `plugins/tech-debt` | Pending manifest review | Pending | Pending | Pending | 1 file | Pending review | Manifest path exists | gpt-6-luna |
| PLG-058 | `plugins/test-convention` | Pending manifest review | Pending | Pending | Pending | 7 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-059 | `plugins/test-policy` | Pending manifest review | Pending | Pending | Pending | 3 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-060 | `plugins/usage-tracking` | Pending manifest review | Pending | Pending | Pending | 24 files | Pending review | Manifest path exists | gpt-6-luna |
| PLG-061 | `plugins/web-fetch` | Pending manifest review | Pending | Pending | Pending | 4 files | Pending review | Manifest path exists | gpt-6-luna |

## Remaining inventory families

The following are identified at the top level, but their component-level entries have not yet been enumerated or reviewed. They remain open coverage items, not implicit approvals:

- Packages: `cli`, `client`, `context-compiler`, `contracts`, `core`, `proposals-sqlite`, `roadmap-sqlite`, `sqlite`, `state`, `state-sqlite`, `state-telemetry`, `test-kit`, `ui-extension` (13 packages; individual manifests and responsibilities remain pending).
- Extension: `vscode`.
- Apps: `shared`, `web`.
- Tooling: `tools/docs-api`, `tools/scripts`, `tools/tests`; enumerate script entrypoints, CI and release workflows individually.
- Also pending: host agents/adapters, Batuta, MCP tool contracts, state schemas, caches/logs, proposals/roadmap, generated registry, docs, fixtures, mocks, benchmarks, legacy and experimental code.

## Next inventory/review action

Enumerate all `tools/`, CI, agent and proposal components from the tree, and start resolving plugin rows one by one in the audit playbook's phase order. Keep all source claims bound to the pinned snapshot.
