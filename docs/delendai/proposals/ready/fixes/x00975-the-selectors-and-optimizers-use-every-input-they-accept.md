---
id: x00975
title: "The selectors and optimizers use every input they accept"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
---

# x00975 — The selectors and optimizers use every input they accept

## goal

optimize_run enforces its budget, plugins_recommend explains a remove with the real cause and uses taskHint, auto_recommend ranks for the task it is given, eval_report names the cheapest passing provider, agent-orchestrator plan and classify use the files and facts they accept and an override changes the steps, triage writes the draft it promises, and release_plan works in the changelog plugin's default configuration.

## why

Joint audit a00095 and gpt-6.1-sol. D52: optimize_run requires budget > 0 as a ceiling but the budget does not govern. D53: plugins_recommend justifies a remove with a false cause. D100: taskHint is accepted but unused. D96: auto_recommend barely sees the task. D106: eval_report's winner is not the cheapest passing provider. sol ORCH-08: plan and classify drop files and facts they accept. sol ORCH-09: plan.override changes the label but keeps the old mode's steps. D55: issues_triage_run reports success without persisting the draft or remote effects. D59: release_plan is advertised but the default configuration cannot run it.

## non-goals

- Batuta's cross-host execution (the batuta proposal).

## slices

- global_gate: type

### S1 — Budgets and recommendations
- **Status**: pending
- **Files**: `plugins/adaptive-optimizer/src/lib/services/optimize-run.service.ts`, `plugins/adaptive-optimizer/src/lib/tools/optimize-run.tool.ts`, `plugins/adaptive-optimizer/src/lib/contracts/interfaces/adaptive-optimizer.interface.ts`, `plugins/adaptive-optimizer/src/generated/tool-outputs.ts`, `plugins/adaptive-optimizer/tests/src/optimize-run.tool.spec.ts`, `plugins/auto-plugin-selector/src/lib/apply/config-diff.ts`, `plugins/auto-plugin-selector/src/lib/apply/config-diff.spec.ts`, `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.ts`, `plugins/auto-plugin-selector/src/lib/score/recommend-plugins.spec.ts`, `plugins/auto-plugin-selector/src/lib/tools/plugins-recommend.tool.ts`, `plugins/auto-agent-selector/src/lib/routing/rank-providers.ts`, `plugins/auto-agent-selector/src/lib/routing/task-mode.service.ts`, `plugins/auto-agent-selector/src/lib/contracts/interfaces/ranking.interface.ts`, `plugins/auto-agent-selector/src/lib/services/discover-ranked-providers.service.ts`, `plugins/auto-agent-selector/tests/src/lib/routing/rank-providers.spec.ts`, `plugins/prompt-eval/src/lib/score/score.ts`, `plugins/prompt-eval/src/lib/score/score.spec.ts`
- **Gate**: type
- acceptance:
  - "The plan stops before exceeding budget (D52)."
  - "A remove names its real cause (D53); taskHint changes scores (D100); the task type shapes the ranking (D96)."
  - "The winner is the cheapest passing provider (D106)."
- notes: optimize_run keeps ranked candidates while their cumulative token cost stays within budget and reports `spent`; a remove names whether the plugin is outside the catalog, cut by limit/minScore, or has no positive fit; taskHint words matching a plugin's id, tags or summary add score; auto_recommend maps taskType to a ranking mode; the eval_report winner is the passing provider with the lowest cost per attempt. optimize_run plus the auto-agent-selector, prompt-eval and plugins_recommend tool files needed no description change.

### S2 — agent-orchestrator, triage and changelog
- **Status**: pending
- **Files**: `plugins/agent-orchestrator/src/lib/tools/plan.tool.ts`, `plugins/agent-orchestrator/src/lib/tools/telemetry.tool.ts`, `plugins/agent-orchestrator/tests/src/lib/tools/plan.tool.spec.ts`, `plugins/issues-triage/src/lib/tools/triage.tools.ts`, `plugins/issues-triage/tests/triage-tools.spec.ts`, `plugins/changelog/src/index.ts`, `plugins/changelog/src/lib/tools/release-plan.tool.ts`, `plugins/changelog/src/lib/tools/discover-publish-order.service.ts`, `plugins/changelog/src/lib/tools/release-plan.tool.spec.ts`
- **Gate**: type
- acceptance:
  - "files and facts reach the classifier (ORCH-08); override regenerates steps (ORCH-09)."
  - "triage persists or returns its draft and says which (D55)."
  - "release_plan runs with the default options (D59)."
- notes: plan and classify now forward files and facts to the classifier and an override re-plans through the named mode so its steps change; triage_run returns the draft when it is not written and reports failed effects in `problems` with ok=false; release_plan derives its publish order from the workspace packages when none is injected. No agent-orchestrator description or output schema grew (execution_policy and the classifier already took files and facts).

## acceptance

- The plan stops before exceeding budget (D52).
- A remove names its real cause (D53); taskHint changes scores (D100); the task type shapes the ranking (D96).
- The winner is the cheapest passing provider (D106).
- files and facts reach the classifier (ORCH-08); override regenerates steps (ORCH-09).
- triage persists or returns its draft and says which (D55).
- release_plan runs with the default options (D59).
