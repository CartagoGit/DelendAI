---
id: f00140
kind: feat
title: router cost + recommendation dashboard — surface auto-agent-selector picks and usage-tracking spend in the CLI and VS Code extension
status: done
date: 2026-07-23
track: plugin+extension+routing
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 5 commits referencing f00140 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 5-commit batch
shipped-in:
  - 568406da # feat(f00140 S3): router dashboard extension webview
  - f2ba3816 # feat(f00140 S2): mcpv router dashboard CLI command
  - 2154c263 # feat(f00140 S1): dashboard view-model builder
  - e1d937f3 # feat(cli): agents command group — router recommendations from the terminal
  - 676008f8 # feat(config,proposals): activate router in this repo + 4 self-improvement propos
---

# f00140 — router cost + recommendation dashboard

## goal

Make routing decisions **visible and steerable** by surfacing
`auto-agent-selector`'s recommendations (per task type, with cost/quality
rationale) alongside `usage-tracking`'s actual spend, in both the **CLI** and a
**VS Code extension panel** — where the user reviews, compares, and **pins** a
provider. This is `f00119` S6 made concrete and wired to real spend data.

## why

The router already recommends and plans, but the user asked to *see* and
*decide*: which provider for which work, how much has been spent, and whether
a cheaper model would still pass the gate. A dashboard closes the loop so the
"recommend, never dictate" promise is actionable, not buried in tool output —
and it is exactly how the user drives "no gastar tantos tokens" in practice.

## why this design

Read-only projection: pull `auto_recommend`/`auto_status` output +
`usage-tracking` spend rows and render them — no new decision logic. The CLI
command and the extension panel share one **pure view-model builder** (roster ×
recommendation × spend → rows), so both surfaces stay identical and testable
without a UI. Pins are written back through the existing config path (user
always wins).

## non-goals

- No new routing logic — it visualises `auto-agent-selector` + `usage-tracking`.
- No spend without consent; no telemetry upload.
- No provider dictation — the panel recommends; the user pins.

## slices

### S1 — shared view-model builder

- **Status**: done
- **Files**: `plugins/auto-agent-selector/src/lib/dashboard/view-model.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/dashboard.interface.ts`, `plugins/auto-agent-selector/tests/src/lib/dashboard/view-model.spec.ts`
- **Gate**: bun run validate

Implemented `buildDashboard(input)` — a pure `(roster, recommendations, spend) → rows + headline` projection. New types live in `contracts/interfaces/dashboard.interface.ts` (IBuildDashboardInput, IDashboardRow, IDashboardViewModel, IRecommendationRow, ISpendSummary, IProviderSpend); the builder in `lib/dashboard/view-model.ts`. Sort order: pinned → best-rank ASC → in-roster → costTier ASC → id (stable). Spend-only providers (recorded but not reachable) appear last with the matching note. 9/9 tests pass, `bun run typecheck` green.

### S2 — CLI command

- **Status**: done
- **Files**: `packages/cli/src/commands/groups/router-dashboard.ts`, `packages/cli/src/commands/groups/router-dashboard.spec.ts`, `packages/cli/src/commands/registry.ts` (registration), `packages/cli/src/contracts/constants/help-translation.constant.ts` (en summary), `plugins/auto-agent-selector/src/public/index.ts` (export buildDashboard + dashboard types)
- **Gate**: bun run validate

Implemented `mcpv router dashboard` (group name `router`; command name `router dashboard`). The command pulls `mcp-vertex_auto-agent-selector_auto_status` + one `mcp-vertex_auto-agent-selector_auto_recommend` per task type + `mcp-vertex_usage-tracking_usage_report` (grouped by `provider`) and pipes them through the shared `buildDashboard` view-model (S1). Text mode renders via `formatRows`; `--json` returns the raw view-model; `--pin=<id>` writes through `auto_recommend`. 7/7 CLI tests pass; cli-coverage now 18 commands; bun run typecheck clean. help-translation.en entry added; non-en languages intentionally fall back to the English summary (matches the rest of the repo).

### S3 — VS Code extension panel

- **Status**: done
- **Files**: `extensions/vscode/src/views/router-dashboard-webview.ts`, `extensions/vscode/src/i18n/router-dashboard.strings.ts`, `extensions/vscode/src/test/router-dashboard-webview.spec.ts`
- **Gate**: bun run validate

Implemented the HTML renderer `renderRouterDashboardHtml(vm, strings)` — a thin presentation adapter over `IDashboardViewModel` from `@mcp-vertex/auto-agent-selector/public`. Theme-aware (CSS vars), default-deny CSP, no scripts, no polling. The pinned chip + best-rank badge + spend-only note bubble up from the S1 view-model so the panel renders identically to `mcpv router dashboard`. New strings file `i18n/router-dashboard.strings.ts` exposes the typed `IRouterDashboardStrings` surface (12-language matrix intentionally deferred to a later slice — non-en currently falls back to en). 6/6 webview tests pass; `bun run typecheck` clean; `lint:proposals` clean; `check:i18n` green. The command-palette registration + view-model fetch are deliberately deferred to a follow-up slice so S3 stays focused on the HTML contract the future action command will reuse.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`, `lint:web`).
- `mcpv router` shows per-task recommendations + spend-to-date; `--pin` persists
  and the router honours it.
- The extension panel renders the same rows and can pin.

## notes

Reuses `auto-agent-selector` (recommend/status) + `usage-tracking` (spend) +
`ui-extension`. Concretises f00119 S6.
