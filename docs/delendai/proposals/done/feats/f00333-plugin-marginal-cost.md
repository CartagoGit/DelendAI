---
id: f00333
title: "plugin marginal cost."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#plugin-marginal-cost
last-transition-id: 7bb20354-edeb-4111-9661-dc2a26919867
last-correlation-id: 7bb20354-edeb-4111-9661-dc2a26919867
last-transition-from: in-progress
---

# f00333 — plugin marginal cost.

## Goal

Migrated work item: plugin marginal cost..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00333-plugin-marginal-cost.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run tools/scripts/report/token-budget-dashboard.spec.ts tools/tests/lint/token-budget-ceiling-ratchet.spec.ts packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts -> 3 files passing (33 tests). Confirmed marginalPluginHard/Warning ceilings and maxPluginBytes rollup satisfy TOK-001/TOK-005.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#plugin-marginal-cost` by `proposal_adopt`
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
this item: the token-tax breakdown listing 'marginal bytes per plugin' as a required metric, line ~1121, and TODO TOK-005 on declaring per-plugin token cost, lines ~1174-1183. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "plugin-marginal-cost" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

Real derived acceptance: the token-budget dashboard must report a
"marginal bytes per plugin" figure (TOK-001's "marginal bytes per
plugin" dashboard column) AND the budget contract must be able to
govern it with real, non-defaulted ceilings (TOK-005's per-plugin
declaration).

Already implemented, not net-new work:
- `packages/core/src/lib/contracts/constants/token-budgets.constant.ts`
  defines `IGovernedToolsListBudget` with required
  `marginalPluginHard`/`marginalPluginWarning` fields per governed
  preset (the type comment cites `AUD-B02 / x00283` explaining why
  these were made non-optional after silently defaulting to `?? 0`
  produced false "over hard (0B)" violations for every plugin).
- `tools/scripts/report/token-budget-report-lib.ts`
  (`measureToolListMetrics`) computes real per-plugin
  `toolsListBytes`/`schemaBytes`/... rollups and a `maxPluginBytes`
  figure across all plugin owners.
- `docs/mcp-vertex/TOKEN-BUDGETS.md` (generated) documents "marginal
  plugin ceiling: max static tools/list bytes one plugin is allowed to
  contribute" and renders a plugin-marginal table from the same
  contract the e2e test governs.

Ran
`npx vitest run tools/scripts/report/token-budget-dashboard.spec.ts tools/tests/lint/token-budget-ceiling-ratchet.spec.ts packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts`
on 2026-09-02: 3 files, tests passing (see also the combined 57/57 run
across the token-budget + manifest test set). No code change required;
closing on this evidence.
