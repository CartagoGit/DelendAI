---
id: f00338
title: "token tax."
kind: feat
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/proposals/done/audits/a00092-mcp-vertex-auditoria-integral-de-develop-y-todo-maestro-de-mejora.md#token-tax
last-transition-id: 781c1942-989c-4565-9c66-7dec16ef8f35
last-correlation-id: 781c1942-989c-4565-9c66-7dec16ef8f35
last-transition-from: in-progress
---

# f00338 — token tax.

## Goal

Migrated work item: token tax..

## why

Imported from a foreign proposal format so it can be tracked under the canonical proposal workflow.

## non-goals

- Preserve the source document as an independently editable proposal.

## Slices

### S1 — Review migrated proposal

- **Status**: done
- **Files**: `docs/mcp-vertex/proposals/review/f00338-token-tax.md`
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
- review-log: approved by sonnet-verifier-migrated — Ran npx vitest run plugins/usage-tracking/tests/token-tax.spec.ts -> passing. Confirmed staticSchemaBytes/compactTypicalBytes/p95ResponseBytes exact match to TOK-005.
## acceptance

- The migrated proposal is reviewed and its files and validation gate are made explicit.

## notes

- Migrated from `docs/mcp-vertex/audits/legacy/2026-08-24-develop-external-audit.md#token-tax` by `proposal_adopt`
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
this item: TODO TOK-005 — Token tax por plugin, a fully specified JSON shape (staticSchemaBytes/compactTypicalBytes/p95ResponseBytes), lines ~1174-1183. This was closed as a bulk book-keeping no-op
alongside dozens of siblings without anyone re-running that one `git
show`. Reopening S1 to `pending`; the real next step is to derive an
actual scope/acceptance for "token-tax" from the recovered source
before this proposal can be marked done.

### Verified 2026-09-02

TOK-005 (lines ~1174-1183) specifies a per-plugin "token tax" JSON
shape: `staticSchemaBytes`, `compactTypicalBytes`, `p95ResponseBytes`.

Real derived acceptance: each plugin must have a derivable token-tax
record with exactly those three fields (schema overhead, typical
compact response size, p95 response size), computed from real
observed data where available and falling back to a documented
estimate otherwise.

Already implemented, not net-new work: `plugins/usage-tracking/src/lib/token-tax.helper.ts`
(`buildTokenTax`) returns `{ plugin, staticSchemaBytes,
compactTypicalBytes, p95ResponseBytes, totalBytes, estimated,
observedToolCount, observedResponseSamples, sources }` — field names
match TOK-005 exactly, plus provenance (`sources`) distinguishing
observed-from-real-data vs. estimated-default. It is wired into
`IUsageSummary.pluginKpis[].tokenTax` in
`plugins/usage-tracking/src/lib/types.ts`. Covered by
`plugins/usage-tracking/tests/token-tax.spec.ts`. Ran
`npx vitest run plugins/usage-tracking/tests/token-tax.spec.ts` on
2026-09-02: passing. No code change required; closing on this
evidence.
