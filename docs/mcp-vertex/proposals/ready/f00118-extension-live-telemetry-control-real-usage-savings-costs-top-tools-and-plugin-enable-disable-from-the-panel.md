---
id: f00118
title: "Extension live telemetry + control — real usage, savings, costs, top tools, and plugin enable/disable from the panel"
kind: feat
status: ready
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
- **Status**: pending
- **DependsOn**: [S1]
- **Files**: `packages/core/src/lib/tools/configuration-center.tool.ts`, `packages/client/src/lib/services/configuration-center.service.ts`, `extensions/vscode/src/dev/pages/configuration-center.ts`, `packages/core/tests/src/lib/tools/configuration-center-write.spec.ts`
- **Gate**: e2e
- acceptance:
  - "configuration_center accepts {action:'set-plugin-enabled', plugin, enabled} → persists to mcp-vertex.config.json (writeFileAtomic; disabledPlugins list or plugins map), returns {needsRestart:true}; unknown plugin → structured error listing known ones."
  - "Extension page renders per-plugin toggles gated by a modal confirm and shows the restart-needed banner after a change; spec covers the write path + guard."

### S4 — Integration: e2e over the in-memory server + budgets + parity ratchets
- **Status**: pending
- **DependsOn**: [S2, S3]
- **Files**: `packages/core/tests/src/lib/e2e/telemetry-control.e2e.spec.ts`, `docs/mcp-vertex/TOKEN-BUDGETS.md`
- **Gate**: e2e
- acceptance:
  - "e2e: boot with usage-tracking loaded, drive a few tool calls, assert TelemetryService snapshot fills and set-plugin-enabled round-trips; token-budget e2e stays under ceilings (or re-measured honestly)."
  - "lint:cli-ui-parity + shared-ui-ratchet + full validate green."

## acceptance

- snapshot() returns {topTools[], topSkills[], tokens{used,saved,savingsPercent}, spend{total,byProvider[]}, perPlugin[]} joining metrics + usage_report; when usage-tracking is absent the spend section is null and everything else still fills from metrics.
- Spec covers both shapes with a fake client; exported from the public barrel.
- Inline-SVG bar/sparkline components (escapeHtml everywhere, aria-labelled via i18n); dashboard gains a telemetry section fed by TelemetryService with top tools, savings %, accumulated spend.
- check:i18n green: every new key in all 12 languages incl. the authored-es gate; shared-ui-ratchet green (no hardcoded aria).
- configuration_center accepts {action:'set-plugin-enabled', plugin, enabled} → persists to mcp-vertex.config.json (writeFileAtomic; disabledPlugins list or plugins map), returns {needsRestart:true}; unknown plugin → structured error listing known ones.
- Extension page renders per-plugin toggles gated by a modal confirm and shows the restart-needed banner after a change; spec covers the write path + guard.
- e2e: boot with usage-tracking loaded, drive a few tool calls, assert TelemetryService snapshot fills and set-plugin-enabled round-trips; token-budget e2e stays under ceilings (or re-measured honestly).
- lint:cli-ui-parity + shared-ui-ratchet + full validate green.
