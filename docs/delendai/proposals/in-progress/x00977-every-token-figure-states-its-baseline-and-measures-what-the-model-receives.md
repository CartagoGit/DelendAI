---
id: x00977
title: "Every token figure states its baseline and measures what the model receives"
kind: fix
status: in-progress
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: 20de8dbb-6945-4ceb-ac63-536ceae17cc5
last-correlation-id: 20de8dbb-6945-4ceb-ac63-536ceae17cc5
last-transition-from: ready
last-transition-at: 2026-11-01T12:30:56.312Z
---

# x00977 — Every token figure states its baseline and measures what the model receives

## goal

Token budgets, savings and taxes are measured on the bytes the model receives (content, structuredContent and _meta), against a stated baseline, with estimates labelled as estimates; the compact router does not send its result twice; responses have a size budget; and manifest budgets match the real tool definitions.

## why

Joint audit a00095 and gpt-6.1-sol. G4: token-budget pressure (auto_work over its warning). G94: compact_router copies the inner result twice (text and structuredContent). G95: no response has a size budget; review_queue returned 180.8 MB in 7 days. G96: project_kpis labels as measured a token saving no source records. G133: the measured saving is against the native MCP surface, not against not using DelendAI (a trivial search: 13,541 B vs 218 B with grep). D36: the token dashboard measures only structuredContent. sol TOK-01: the dashboard announces a fixed 18% saving without baseline. sol TOK-02: TokenTax presents a heuristic as exact. sol G61-MEM03: bytesAvoided counts delivered bytes without a baseline. sol USAGE-02: same-tool completions in reverse order corrupt latency attribution. sol USAGE-03: savingsPercent changes denominator. sol CP-08: commit-policy's real tools/list footprint nearly doubles its declared budget. sol SURF-01: three plugin byte budgets diverge from the real MCP definitions.

## non-goals

- Changing which tools are exposed (managed surface work).

## slices

- global_gate: type

### S1 — The router sends one copy and responses have a budget
- **Status**: pending
- **Files**: `packages/core/src/lib/context-budget/bound-tool-result.service.ts`, `packages/core/src/lib/context-budget/bound-tool-result.service.spec.ts`, `packages/core/src/lib/project/instrument-tool-handlers.helper.ts`, `packages/core/src/lib/contracts/interfaces/host-config.interface.ts`, `docs/delendai/TOKEN-BUDGETS.md`
- **Gate**: type
- acceptance:
  - "A routed result carries its payload once (G94): the router drops text that restates the structured content."
  - "Every tool result above a configured byte budget comes back as a stated failure with its head and the path of the kept output; review_queue pages (G95)."

### S2 — Measurements state their baseline
- **Status**: pending
- **Files**: `tools/scripts/report/token-budget-report-lib.ts`, `packages/client/src/lib/services/dashboard.service.ts`, `packages/ui-extension/src/dashboard/render-panel-tokens.ts`, `apps/shared/src/i18n/langs/en.ts`, `apps/shared/src/i18n/langs/es.ts`, `plugins/usage-tracking/src/lib/token-tax.helper.ts`, `plugins/project-kpis/src/lib/services/efficiency-analysis.service.ts`
- **Gate**: type
- acceptance:
  - "payloadBytes counts structuredContent, _meta, and text that does not restate the structured content (D36)."
  - "No fixed saving is shown; every figure names its baseline and whether it is measured or estimated (TOK-01, TOK-02, G96, G133)."

### S3 — usage-tracking and memory arithmetic
- **Status**: pending
- **Files**: `plugins/usage-tracking/src/lib/rollup.ts`, `plugins/usage-tracking/src/index.ts`, `plugins/usage-tracking/src/public/index.ts`, `plugins/memory/src/lib/services/store-recall.ts`
- **Gate**: type
- acceptance:
  - "Latency uses the elapsed each call carries (USAGE-02); savingsPercent keeps one denominator (USAGE-03); a figure with no baseline is named bytesDelivered, not bytesAvoided (G61-MEM03)."

### S4 — Manifest budgets match the definitions
- **Status**: pending
- **Files**: `tools/scripts/test/manifest-budget.helper.ts`, `tools/scripts/test/manifest-budget.helper.spec.ts`, `tools/scripts/test/run-actual-preset-budget.script.ts`, `plugins/commit-policy/plugin.manifest.ts`, `plugins/rules/plugin.manifest.ts`, `plugins/search/plugin.manifest.ts`, `plugins/issues/plugin.manifest.ts`
- **Gate**: type
- acceptance:
  - "A gate measures each plugin's real tools/list bytes against its manifest budget and fails on divergence (CP-08, SURF-01, G4)."

## acceptance

- A routed result carries its payload once; a spec compares bytes before and after (G94).
- Every tool result above a configured byte budget is truncated with a handle to the rest; review_queue pages (G95).
- payloadBytes counts content, structuredContent and _meta (D36).
- No fixed saving is shown; every figure names its baseline and whether it is measured or estimated (TOK-01, TOK-02, G96, G133).
- Latency uses the elapsed each call carries (USAGE-02); savingsPercent keeps one denominator (USAGE-03); a figure with no baseline is named bytesDelivered, not bytesAvoided (G61-MEM03).
- A gate measures each plugin's real tools/list bytes against its manifest budget and fails on divergence (CP-08, SURF-01, G4).
