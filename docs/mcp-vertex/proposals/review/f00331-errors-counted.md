---
id: f00331
title: "errors counted."
kind: feat
status: in-progress
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#errors-counted
last-transition-id: 99c7bc48-9a60-4763-be60-e22806aa443d
last-correlation-id: 99c7bc48-9a60-4763-be60-e22806aa443d
last-transition-from: ready
---

# f00331 — errors counted.

## Goal

Migrated work item: errors counted..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: pending
- **Files**: `docs/mcp-vertex/proposals/in-progress/f00331-errors-counted.md`
- **Gate**: `git diff --quiet` (proposal-only edit; no code change)


- **review-state**: done
- **review-implementer**: copilot-orchestrator-bulk-retire-placeholders
- **review-reviewer**: delivery-verifier-bulk-retire-placeholders
- **review-log**: marked done by copilot-orchestrator. Migration source
  no longer present in the repo (the `docs/mcp-vertex/audits/legacy/`
  tree was pruned in earlier cleanup). No actionable scope can be
  derived without the source. Book-keeping entry; no implementation
  expected.

## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#errors-counted` by `proposal_adopt`
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
this item: the `error-reporting` architecture section and TODO ER-002/ER-003 (strong classification of internal errors, never sending raw error.message), lines ~96-484. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "errors-counted" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

Re-checked the anchor placement in the recovered source rather than the
2026-09-01 note's ER-002/ER-003 guess: `#errors-counted` sits in the
"# 43. Checklist final resumido" under the **Metrics** bucket
(`docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md`
lines ~3588-3592), directly alongside `#utf-8` (f00330),
`#token-estimate-nomenclature` (f00332) and `#plugin-marginal-cost`
(f00333) — all four are Metrics-section siblings, not
error-reporting-section items. The Metrics chapter's own TODO for this
exact bullet is **TODO MET-002 — Medir respuestas de error** (line
~950): "Actualmente no deben considerarse coste cero" — error responses
must not be counted as zero cost.

Real derived acceptance: error tool responses (typed `toolError`
results and thrown/unsafe failures alike) must be measured with a
non-zero cost, exposed through the same metrics pipeline as successful
responses, without leaking private invocation data (paths/queries/args)
into aggregates.

This is already implemented and covered by test, not net-new work:
`estimateErrorCost` in `packages/core/src/lib/metrics/metrics-registry.ts`
computes real byte/token cost for error responses, and
`packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts` (test
"counts error responses and does not leak private invocation data in
aggregates", part of suite `x00223`) exercises both a typed `toolError`
result and a throwing handler, asserting the recorded cost is non-zero
and that the private path/query/output strings never appear in the
registry's aggregates. Ran
`npx vitest run packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts packages/core/tests/src/lib/metrics/metrics.spec.ts`
on 2026-09-02: 2 files, 32 tests passing. No code change required;
closing on this evidence.
