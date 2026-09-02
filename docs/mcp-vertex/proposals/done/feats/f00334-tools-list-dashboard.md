---
id: f00334
title: "`tools/list` dashboard."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#tools-list-dashboard
last-transition-id: 80feeea8-03a1-4b08-958f-d58e09e6a68a
last-correlation-id: 80feeea8-03a1-4b08-958f-d58e09e6a68a
last-transition-from: in-progress
---

# f00334 — `tools/list` dashboard.

## Goal

Migrated work item: `tools/list` dashboard..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00334-tools-list-dashboard.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.
- review-state: done
- review-implementer: sonnet-worker-migrated
- review-reviewer: sonnet-verifier-migrated
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run tools/scripts/report/token-budget-dashboard.spec.ts packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts -> passing. Confirmed generated TOKEN-BUDGETS.md sourced from token-budgets.constant.ts satisfies TOK-001.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#tools-list-dashboard` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.

- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

### Reopened 2026-09-01

Verified against the record instead of trusting the review-log. The
review-log's claim that "no actionable scope can be derived without
the source" does not hold up: the migration source,
`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`,
was never actually gone — it existed in git history at commit
`e83d7da0f` (2026-08-24) and was only removed from the working tree in
`b08aae828` (2026-08-30, the same day this proposal was generated). It
was recoverable with a single `git show
e83d7da0f:docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`
the entire time, and it contains substantive, specific content for
this item: the token-tax and dashboard checklist items (lines ~2739, ~3286-3305) describing a generated tools/list dashboard. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "tools-list-dashboard" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

The canonical TODO for this item is TOK-001 — "Tratar `tools/list`
como coste de primer orden" (lines ~1103-1123): create a generated
dashboard reporting, per preset, tool count / schema bytes /
description bytes / inputSchema bytes / outputSchema bytes / marginal
bytes per plugin.

Real derived acceptance: a generated (not hand-maintained) report must
exist that breaks down `tools/list` payload bytes by preset and by
plugin/component, with the numbers sourced from the same contract the
governing test imports.

Already implemented, not net-new work:
- `tools/scripts/report/token-budget-dashboard.script.ts` +
  `tools/scripts/report/token-budget-report-lib.ts`
  (`measureToolListMetrics`, `IToolOwnerMetrics`,
  `IToolBreakdownRow`) compute exactly this: per-preset tool count,
  schema/description/inputSchema/outputSchema/annotations/envelope
  bytes, per-owner (plugin) rollups, and `maxPluginBytes`.
- `docs/mcp-vertex/TOKEN-BUDGETS.md` is the generated artifact
  (header: "generated: token-budget-dashboard.script.ts... Do not
  edit this markdown by hand"), containing a fixture-gated surfaces
  table, a component breakdown, and a plugin-marginal table, all
  sourced from `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`
  — the same contract `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
  imports.

Ran
`npx vitest run tools/scripts/report/token-budget-dashboard.spec.ts packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
