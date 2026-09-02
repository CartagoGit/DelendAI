---
id: f00335
title: "absolute budgets."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#absolute-budgets
last-transition-id: 7d73218b-48b3-46ad-88fc-fabf81f270bd
last-correlation-id: 7d73218b-48b3-46ad-88fc-fabf81f270bd
last-transition-from: in-progress
---

# f00335 — absolute budgets.

## Goal

Migrated work item: absolute budgets..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00335-absolute-budgets.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts tools/tests/lint/token-budget-ceiling-ratchet.spec.ts tools/scripts/report/token-budget-dashboard.spec.ts -> passing. Confirmed all four ceiling kinds (hard/warning/release/marginal) present per TOK-002.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#absolute-budgets` by `proposal_adopt`
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
this item: TODO TOK-004 (generate TOKEN-BUDGETS.md instead of hand-maintaining numbers) and the surrounding budget TODOs, lines ~1160-1170. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "absolute-budgets" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

The canonical TODO here is TOK-002 — "Presupuestos absolutos y
relativos" (lines ~1126-1146, not TOK-004 as the 2026-09-01 note
guessed — TOK-004's generated-markdown scope is f00336's item):
budgets must not be only a relative "+20% vs baseline" delta; they
need a hard absolute ceiling, a warning ceiling, a relative release
ceiling, and a marginal-plugin ceiling, all tracked simultaneously.

Real derived acceptance: the token budget contract must expose all
four ceiling kinds per governed surface, not just a relative delta.

Already implemented, not net-new work:
`packages/core/src/lib/contracts/constants/token-budgets.constant.ts`
defines `ITokenBudgetCeiling` (`hard`, `warning`,
`releaseRelativePercent`) and `IGovernedToolsListBudget` (adds
`marginalPluginHard`/`marginalPluginWarning`) — the exact four ceiling
kinds TOK-002 calls for — applied per surface (`overviewFull`,
`agentCatalogCompact`, `search`, ...) and per preset
(`minimal`/`lean`/`standard`/`swarm`/`full`/`vertex`). The generated
`docs/mcp-vertex/TOKEN-BUDGETS.md` documents all four under
"## Semantics" (hard ceiling / warning ceiling / release ceiling /
marginal plugin ceiling) and renders them per surface in its tables.
`packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts` and
`tools/tests/lint/token-budget-ceiling-ratchet.spec.ts` govern hard
ceilings and the release-relative ratchet respectively.

Ran
`npx vitest run packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts tools/tests/lint/token-budget-ceiling-ratchet.spec.ts tools/scripts/report/token-budget-dashboard.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
