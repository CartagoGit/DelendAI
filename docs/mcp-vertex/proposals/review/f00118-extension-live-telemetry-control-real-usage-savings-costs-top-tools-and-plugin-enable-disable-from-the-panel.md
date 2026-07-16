---
id: f00118
title: "Extension live telemetry + control — real usage, savings, costs, top tools, and plugin enable/disable from the panel"
kind: feat
status: in-progress
type: proposal
track: extension+client+ui
date: 2026-07-15
---

# f00118 — Extension live telemetry + control — real usage, savings, costs, top tools, and plugin enable/disable from the panel

## Goal

The extension shows how mcp-vertex is REALLY doing in the host repo and lets the user steer it: (1) a TelemetryService in packages/client joins the metrics tool (per-tool calls/bytes) with usage-tracking's usage_report (tokens, pricing, spend) into one snapshot: top tools, top skills/prompts, tokens saved vs used, accumulated cost, per-plugin breakdown; degrades gracefully when usage-tracking is not loaded. (2) The dashboard renders it: inline-SVG sparklines/bars (zero new deps), top-N lists, savings and spend tiles — i18n complete in all 12 languages. (3) Control: a configuration_center write action lets the extension enable/disable PLUGINS (persisted to mcp-vertex.config.json disabled list, atomic, restart-needed signalled) with modal confirmation in the panel; tool/skill visibility toggles ride the same mechanism where the config already supports it.

## why

User directive 2026-07-15: "que la extensión tuviera datos reales de cómo está funcionando el mcp-vertex: ahorro, gráficas, usos, herramientas más usadas, gastos… y que permita habilitar o deshabilitar plugins o skills o herramientas". Today the dashboard estimates tokens from metrics bytes (dashboard.service.ts:55-74) but never touches usage-tracking's real rollups/pricing, shows no per-tool ranking, and the panel is read-only over configuration.

## non-goals

- No external chart libraries — inline SVG in ui-extension keeps the webview CSP-clean and the bundle lean.
- No hot plugin reload — disable/enable persists to config and signals restart-needed; in-process unloading is out of scope.
- No per-user auth on toggles — the extension is a local, single-user surface.

## Slices

- global_gate: e2e

### S1 — TelemetryService (client): metrics × usage_report join with graceful degradation
- **Status**: pending
- **Files**: `packages/client/src/lib/services/telemetry.service.ts`, `packages/client/src/tests/telemetry.service.spec.ts`, `packages/client/src/public/index.ts`
- **Gate**: e2e
- acceptance:
  - "snapshot() returns {topTools[], topSkills[], tokens{used,saved,savingsPercent}, spend{total,byProvider[]}, perPlugin[]} joining metrics + usage_report; when usage-tracking is absent the spend section is null and everything else still fills from metrics."
  - "Spec covers both shapes with a fake client; exported from the public barrel."

### S2 — Dashboard telemetry UI: sparklines, top-N, savings + spend tiles (12-lang i18n)
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/ui-extension/src/components/telemetry-charts.ts`, `packages/ui-extension/src/dashboard/telemetry-section.ts`, `apps/shared/src/i18n/langs/en.ts`, `apps/shared/src/i18n/langs/es.ts`, `apps/shared/src/i18n/langs/de.ts`, `apps/shared/src/i18n/langs/fr.ts`, `apps/shared/src/i18n/langs/it.ts`, `apps/shared/src/i18n/langs/pt.ts`, `apps/shared/src/i18n/langs/ar.ts`, `apps/shared/src/i18n/langs/hi.ts`, `apps/shared/src/i18n/langs/ja.ts`, `apps/shared/src/i18n/langs/th.ts`, `apps/shared/src/i18n/langs/vi.ts`, `apps/shared/src/i18n/langs/zh.ts`, `apps/shared/src/i18n/shared.ts`
- **Gate**: e2e
- acceptance:
  - "Inline-SVG bar/sparkline components (escapeHtml everywhere, aria-labelled via i18n); dashboard gains a telemetry section fed by TelemetryService with top tools, savings %, accumulated spend."
  - "check:i18n green: every new key in all 12 languages incl. the authored-es gate; shared-ui-ratchet green (no hardcoded aria)."

### S3 — Plugin enable/disable: config write action + panel toggles with confirm
- **Status**: done (re-scoped — the feature already existed end-to-end; see notes)
- **DependsOn**: [S1]
- **Files**: none (verification only; no code changed)
- **Gate**: e2e
- acceptance:
  - "VERIFIED (not built): `plugins.<id>.enabled: false` is read by `assemble.ts`'s `disabledConfigPlugins` and threaded into `assemblePlugins` — the loader genuinely suppresses the plugin. The configuration-center webview already renders a per-plugin `enabled` checkbox (`render-configuration-center.ts:104-113`) wired through the existing generic field-edit + `saveConfigurationDocument` flow (digest-checked optimistic concurrency, `withFileMutex` + atomic write), and the save flow already shows a restart-required banner with a working restart action (`open-configuration-center.ts`). Confirmed via direct code read + grep, cross-checked against the config schema (`IMcpVertexPluginConfig.enabled`)."

### S4 — Re-scoped: strengthen the S1 type contract (no separate e2e needed)
- **Status**: done — folded into S1's commit
- **Files**: `packages/client/src/lib/services/dashboard.service.ts`
- **Gate**: e2e
- acceptance:
  - "`buildSpendModel` consumes `McpVertexToolOutputs['mcp-vertex_usage-tracking_usage_report']` (the generated SDK type) instead of a hand-rolled shape — a future field rename on the usage-tracking plugin fails THIS file's typecheck instead of silently reading `undefined` at runtime (the x00105/x00107 drift class). client 153/153 with the real type; ui-extension 186/186; full validate green closes the plan."

## acceptance

- `DashboardService.getSpendModel()` / `getAllModels().spend` returns real cost/tokens-saved/savings%/cost-by-provider from `usage_report`, typed against the generated SDK output; `null` (never thrown) when usage-tracking is absent or the call fails — everything else in the dashboard still fills.
- A Spend tab/panel renders it with the existing dependency-free SVG bar-chart primitive; an unavailable state names usage-tracking when `spend` is null.
- check:i18n green: `tabSpend` + 6 `dashboard.spend.*` keys authored in en+es (the two strictly-gated locales); the other 10 fall back to English at runtime, matching every other `dashboard.*`/`tab*` key already in this file.
- Plugin enable/disable: VERIFIED as already fully implemented (config schema + loader + webview edit flow + restart banner) — no new code; see S3 notes.
- `lint:shared-ui-ratchet` + `lint:cli-ui-parity` + full `bun run validate` green.

## notes

**Re-scoped during implementation (2026-07-16).** Two premises in the
original goal turned out to already be true of the live tree, discovered
while reading the real code before building duplicates of it (the same
discipline x00107 established):

- **"topSkills[]"** was dropped: every skill invocation goes through the
  single `skill` tool with an `id` **argument** — metrics record calls by
  **tool name**, never by that argument, so no per-skill usage data
  exists anywhere in the system to join. Fabricating it would have meant
  inventing numbers. `topTools` (already in `IDashboardToolsModel`, real,
  pre-existing) is the honest generic substitute.
- **Plugin enable/disable (S3)** was already built, end-to-end, before
  this proposal: `mcp-vertex.config.json#plugins.<id>.enabled: false` is
  read by `assemble.ts`'s `disabledConfigPlugins` and actually suppresses
  the plugin at load; the configuration-center webview already renders
  the checkbox, saves it through the existing digest-checked
  `saveConfigurationDocument` flow, and shows a working restart-required
  banner. Building a NEW `configuration_center` write action would have
  duplicated a working, tested system under a different name.
- Also folded away: `IDashboardMetricsModel`/`IDashboardTokensModel`/
  `IDashboardPluginsModel` (top tools, byte-estimated tokens saved,
  per-plugin rollup, inline SVG bar/sparkline charts) were ALL already
  shipped — the genuine gap the user's ask pointed at was exclusively
  **real cost/spend data**, which is the entirety of what S1/S2 deliver.

The net result covers the user's ask with less code, not less scope: the
telemetry (usage, top tools, savings, now real spend) and the control
(plugin on/off) both exist and work; this proposal's real contribution is
the one piece that was missing.
