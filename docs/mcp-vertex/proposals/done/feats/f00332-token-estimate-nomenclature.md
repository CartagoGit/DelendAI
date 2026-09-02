---
id: f00332
title: "token estimate nomenclature."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#token-estimate-nomenclature
last-transition-id: 7620530f-b3d5-4884-89b3-8265fe2b006f
last-correlation-id: 7620530f-b3d5-4884-89b3-8265fe2b006f
last-transition-from: in-progress
---

# f00332 — token estimate nomenclature.

## Goal

Migrated work item: token estimate nomenclature..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/done/feats/f00332-token-estimate-nomenclature.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts packages/core/tests/src/lib/metrics/metrics.spec.ts -> 2 files, 32 tests passing. Confirmed field naming contentTextBytes/structuredJsonBytes/wireEstimateBytes/estimatedTokens4B/actualModelTokens matches MET-003/MET-004.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#token-estimate-nomenclature` by `proposal_adopt`
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
this item: TODO MET-001, which spells out the exact naming problem (`~4 bytes/token` rule conflated with real token counts) and proposes concrete field names (contentTextBytes, wireEstimateBytes), lines ~937-977. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "token-estimate-nomenclature" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

The relevant TODO is actually MET-003/MET-004 (lines ~958-987), not
MET-001 (which is the `estimateResultBytes` bytes-fix covered by
f00330): MET-003 proposes a `ToolCost` shape with
`contentTextBytes`/`structuredJsonBytes`/`wireEstimateBytes`/
`estimatedTokens`, and MET-004 requires distinguishing the `~4
bytes/token` heuristic from a real model token count instead of
conflating them — concretely naming `estimatedTokens4B` vs.
`actualModelTokens`.

Real derived acceptance: the metrics cost type must expose separate,
correctly-named fields for text bytes, structured-JSON bytes, the wire
estimate, the byte-ratio token estimate, and (when available) the real
model token count — never a single ambiguous "tokens" field.

Already implemented, not net-new work: `estimateResultCost` in
`packages/core/src/lib/metrics/metrics-registry.ts` returns exactly
this shape — `contentTextBytes`, `structuredJsonBytes`,
`wireEstimateBytes`, and `estimatedTokens: { estimatedTokens4B,
actualModelTokens }` — matching MET-003/MET-004 field-for-field.
Covered by `bytes-and-errors.spec.ts` ("separates text, structured
JSON and estimated token costs": asserts `estimatedTokens4B ===
Math.ceil(wireEstimateBytes / 4)` and `actualModelTokens` stays
`undefined` when no real tokenizer count exists). Ran
`npx vitest run packages/core/tests/src/lib/metrics/bytes-and-errors.spec.ts packages/core/tests/src/lib/metrics/metrics.spec.ts`
on 2026-09-02: 2 files, 32 tests passing. No code change required;
closing on this evidence.
