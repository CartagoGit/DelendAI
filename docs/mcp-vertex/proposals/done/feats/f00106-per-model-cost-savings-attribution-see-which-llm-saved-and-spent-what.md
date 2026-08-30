---
id: f00106
kind: feat
status: done
type: proposal
track: usage-tracking+ui-extension+vscode+web
date: 2026-07-08
title: "Per-model cost & savings attribution — see which LLM saved (and spent) what"
shipped-in: []
recan: []
related:
    - f00098 # provider dashboard + usage cost analyst — the card this extends with a by-model breakdown
    - f00067 # orchestrator + usage-tracking — records the per-call model already
    - f00090 # in-session compaction — the token-savings mechanic this attributes
ownership:
    - { agent: implementation_runner, task: 'S1: usage_report group-by model + per-model savings in usage-tracking' }
    - { agent: implementation_runner, task: 'S2: by-model savings/cost builder in ui-extension' }
    - { agent: implementation_runner, task: 'S3: dashboard panel wiring (vscode) + web parity' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
---

# f00106 — Per-model cost & savings attribution

## goal

Make the token/cost **savings visible per LLM**: for any session, show which
model handled which calls, how many tokens it spent, and — crucially — how
many tokens mcp-vertex **saved** it (compaction, compact overview, grouped
catalog, etc.), so an agent (or a human watching the extension) can see the
efficiency payoff **broken down by the model doing the work**. This is the
core value proposition — mcp-vertex exists to make any LLM cheaper and
sharper — finally made legible.

## why

The data already exists but is not surfaced by model:

- `usage-tracking` records a per-call `model` block
  (`plugins/usage-tracking/src/lib/types.ts:31-34` — `IModelDescriptor` =
  `{ provider, modelId }`) plus token usage
  (`types.ts:24` `IUsageTokens`), and the record path attaches the model for
  orchestrated calls (`record.ts:5-8`).
- `usage_report` groups by `provider | plugin | agent | extension`
  (`types.ts:137` `GroupByAxis`) — **but not by `model`**, and it reports
  spend/tokens, **not savings**.
- The dashboard tokens panel shows aggregate `tokensSaved` + `savingsPercent`
  (`render-panel-tokens.ts:37,42`) with **no per-model split**.

So today you can see "the session saved N tokens" but never "gpt-5-codex
saved X, claude-sonnet saved Y" — which is exactly the number that tells you
whether routing a task to a given model through mcp-vertex paid off.

**Reality check on savings (verified 2026-07-08):** per-model SPEND and
TOKENS are directly available (`IInvocationRecord.model` + `.usage`). But
`tokensSaved` is NOT stored per call — the dashboard computes it as a
session-level heuristic, `estimateTokensSaved(totals.totalBytes)`
(`packages/client/src/lib/services/dashboard.service.ts:177`), from the
metrics registry's byte totals (compact overview / compaction). So
attributing savings to a specific model requires **stamping a per-call
`tokensSaved` at the moment the saving happens** (compaction/compact-overview
knows the bytes it dropped and the model in the active session). S1 adds that
field; without it, only spend/tokens are per-model and savings stays a
session total.

## non-goals

- **No new savings mechanic** — this attributes existing savings, it does not
  invent new ones.
- **No paid probing** — reads the append-only usage log + the existing
  savings counters; never triggers an invocation.
- **No averaging session vs monthly** (circuit-breaker semantics, per f00098).

## Slices

- global_gate: validate

### S1a — `usage_report` group-by model (spend + tokens; directly available)

- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/types.ts`, `plugins/usage-tracking/src/lib/rollup.ts`, `plugins/usage-tracking/src/lib/tools/report.tool.ts`, `plugins/usage-tracking/tests/src/lib/rollup.spec.ts`
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "`GroupByAxis` gains `'model'` (keyed by `provider/modelId`); the rollup buckets calls whose `model` is known and reports `{ calls, tokens, costUsd }` per model. Calls with `model: null` fall into an explicit `unattributed` bucket, never silently dropped. A spec pins the model buckets sum to the session totals."
  - "outputSchema literal-precise; `bun run types:generate` clean. This slice ships without touching the savings mechanic — spend/tokens per model is the immediately-available half."

### S1b — Per-call `tokensSaved` stamp (makes savings attributable)

- **Status**: done
- **Files**: `plugins/usage-tracking/src/lib/types.ts`, `plugins/usage-tracking/src/lib/record.ts`, the compaction/compact-overview save sites that know the dropped bytes, `plugins/usage-tracking/tests/src/lib/record.spec.ts`
- **Depends on**: S1a
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "`IInvocationRecord` gains an optional `tokensSaved` (older rows parse as 0). The saving is stamped at the moment it happens (the compaction / compact-overview path that already knows the bytes dropped, converted via the same `estimateTokensSaved` heuristic), attributed to the active session's model. The model rollup then reports `{ …, tokensSaved, savingsPercent }`; a spec pins per-model savings sum to the session total (no double count vs the metrics-registry estimate — pick ONE source of truth and document it)."
- **Decision**: The append-only usage row is the sole source for per-model savings; the session-level metrics estimate remains legacy aggregate data and is never redistributed across models. Token-efficiency tools already return their exact estimate (for example `memory_compact.tokenAccounting.tokensSaved`), so usage-tracking stamps that value without estimating it a second time. A bounded session map supplies the last observed orchestrated model only to saving-bearing calls; ordinary plugin calls remain unattributed.
- **Evidence**: Records accept optional `tokensSaved` with legacy `?? 0` folds; buckets/totals and the literal output schema expose saved tokens and savings percent, including an explicit unattributed bucket. Regressions pin extraction, model fallback only on saving calls, legacy zero behavior, per-model/session sum equality and sorting. The SDK generator now loads the publishable usage-tracking plugin and emits its typed report output instead of silently omitting the tool.

### S2 — By-model savings/cost builder (ui-extension)

- **Status**: done
- **Files**: `packages/ui-extension/src/dashboard/builders/model-attribution.builder.ts`, `packages/ui-extension/src/contracts/interfaces/model-attribution.interface.ts`, `packages/ui-extension/tests/dashboard/model-attribution.builder.spec.ts`
- **Depends on**: S1
- **Gate**: bun run lint:cross-ide
- **Acceptance**:
  - "Pure builder maps the S1 group-by-model payload to a render-model: one row per model with spend, tokens, tokens-saved, savings %, and a savings bar; sorted by savings desc. Degrades to the opt-in hint when usage-tracking is absent (f00098 pattern). Spec covers multi-model, unattributed bucket, empty log, plugin-absent."
- **Evidence**: The host-agnostic builder and contracts are exported from the UI package. It sanitizes malformed numeric input, sorts deterministically by savings/cost/key, normalizes bars to the largest saver, flags unattributed rows, distinguishes an empty loaded log from an absent plugin, and reuses the canonical opt-in snippet. Four regressions cover multi-model bars/order, unattributed data, empty logs and plugin absence; all 182 UI-extension tests pass.

### S3 — Dashboard panel (vscode) + web parity

- **Status**: done
- **Files**: `extensions/vscode/src/views/provider-dashboard-webview.ts` (coordinate — f00098 owner), `extensions/vscode/src/i18n/provider-dashboard.strings.ts`, `apps/web/src/pages/providers.astro`, `apps/web/src/i18n/provider-dashboard.ts`
- **Depends on**: S2
- **Gate**: bun run validate
- **Acceptance**:
  - "The provider dashboard renders the by-model attribution table under the usage card (theme-aware, mcpv-* classes, 12-lang strings). The static web /providers page shows the same render-model with a frozen fixture. `bun run site` green."
- **Evidence**: The VS Code adapter requests a second `usage_report` grouped by model and sorted by savings, maps it through the shared builder, and renders spend, used/saved tokens, savings percent and a theme-aware bar beneath the aggregate usage card. It reuses the existing complete 12-language dashboard vocabulary. The web providers page carries the same ordered frozen row shape with an English/Spanish explanation. Focused host/UI tests, VS Code typecheck and Astro check pass, including live HTML assertions for the model and saved-token value.

## acceptance

- `bun run validate` → exit 0.
- For a multi-model session, the dashboard + web show tokens spent AND tokens
  saved per model, summing to the session totals.
- Every view degrades to the opt-in hint when the plugins are absent.
