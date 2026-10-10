---
id: f00336
title: "generated budgets."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#generated-budgets
last-transition-id: c1e84a1c-1fd0-48c6-8535-325b742ba93d
last-correlation-id: c1e84a1c-1fd0-48c6-8535-325b742ba93d
last-transition-from: in-progress
---

# f00336 — generated budgets.

## Goal

Migrated work item: generated budgets..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00336-generated-budgets.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run tools/scripts/report/token-budget-dashboard.spec.ts -> passing. Confirmed TOKEN-BUDGETS.md is generated, not hand-maintained, satisfying TOK-004.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#generated-budgets` by `proposal_adopt`
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
this item: TODO TOK-004 — Generar `TOKEN-BUDGETS.md`, explicit: 'No mantener números manualmente. Generar Markdown desde la misma fuente que usa el test.', lines ~1160-1170. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "generated-budgets" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

TOK-004 confirmed as the correct source item (lines ~1160-1170):
"Generar `TOKEN-BUDGETS.md`" — documentation and tests had diverged
because numbers were hand-maintained; the fix is to generate the
markdown from the same source the test uses, never hand-edit it.

Real derived acceptance: `TOKEN-BUDGETS.md` must be a generated
artifact, produced from the same contract module the governing test
imports, with a script that can regenerate it and a lint/check that
catches drift.

Already implemented, not net-new work: `docs/mcp-vertex/TOKEN-BUDGETS.md`
carries the header "generated: token-budget-dashboard.script.ts...
generated — do not edit by hand" and states explicitly: "This file is
generated from the same budget contract the e2e test imports:
packages/core/src/lib/contracts/constants/token-budgets.constant.ts.
Do not edit this markdown by hand; regenerate it with
bun tools/scripts/report/token-budget-dashboard.script.ts." The
generator lives at `tools/scripts/report/token-budget-dashboard.script.ts`
and `tools/scripts/report/token-budget-report-lib.ts`, covered by
`tools/scripts/report/token-budget-dashboard.spec.ts`. Ran
`npx vitest run tools/scripts/report/token-budget-dashboard.spec.ts`
on 2026-09-02: passing. No code change required; closing on this
evidence.
